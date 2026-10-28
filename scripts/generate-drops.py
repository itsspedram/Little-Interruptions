#!/usr/bin/env python3
"""Synthesises the water-drop sounds in apps/desktop/src-tauri/assets/drops.

Every sound is made here from scratch (a sine that rises in pitch like a collapsing air bubble,
plus a tiny click, ripples and room), so there is nothing to license. Needs numpy.
Run:  python3 scripts/generate-drops.py
"""
import wave
from pathlib import Path

import numpy as np

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "apps/desktop/src-tauri/assets/drops"


def t_axis(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def bubble(f_start, f_end, decay, length=0.5, shape=6.0, harmonics=((1.0, 1.0),)):
    """A drop's 'bloop': a decaying sine whose pitch glides up from f_start to f_end."""
    t = t_axis(length)
    glide = 1 - np.exp(-shape * t / max(decay * 3, 1e-3))
    freq = f_start + (f_end - f_start) * glide
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    env = np.exp(-t / decay)
    wave_ = sum(amp * np.sin(phase * mult) for mult, amp in harmonics)
    attack = np.minimum(1, t / 0.002)
    return wave_ * env * attack


def click(freq=3200, length=0.012, amp=0.5):
    t = t_axis(length)
    return amp * np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.002)


def place(base, part, at, gain=1.0):
    start = int(at * RATE)
    end = min(len(base), start + len(part))
    if start < len(base):
        base[start:end] += part[: end - start] * gain
    return base


def room(signal, seconds, wet, seed):
    """Soft reverb: convolve with decaying, low-passed noise."""
    rng = np.random.default_rng(seed)
    n = int(seconds * RATE)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / RATE / (seconds / 4.5))
    kernel = np.ones(6) / 6
    ir = np.convolve(ir, kernel, mode="same")
    ir[0] = 0
    ir /= np.max(np.abs(ir)) + 1e-9
    size = len(signal) + n
    spectrum = np.fft.rfft(signal, size) * np.fft.rfft(ir, size)
    tail = np.fft.irfft(spectrum, size)
    padded = np.concatenate([signal, np.zeros(n)])
    return padded + wet * tail / (np.max(np.abs(tail)) + 1e-9) * np.max(np.abs(signal))


def finish(signal, peak=0.62):
    signal = signal - np.mean(signal)
    signal = signal / (np.max(np.abs(signal)) + 1e-9) * peak
    audible = np.nonzero(np.abs(signal) > 0.004)[0]
    if len(audible):
        signal = signal[: audible[-1] + int(0.05 * RATE)]
    fade = int(0.04 * RATE)
    signal[-fade:] *= np.linspace(1, 0, fade)
    return signal


def build():
    sounds = {}

    s = np.zeros(int(0.7 * RATE))
    place(s, click(), 0, 0.5)
    place(s, bubble(650, 1700, 0.045, 0.5), 0.0)
    sounds["drip"] = room(s, 0.35, 0.18, 1)

    s = np.zeros(int(0.9 * RATE))
    place(s, bubble(240, 820, 0.085, 0.8, harmonics=((1, 1), (2, 0.18))), 0.0)
    sounds["bloop"] = room(s, 0.4, 0.15, 2)

    s = np.zeros(int(0.5 * RATE))
    place(s, click(4200, 0.01, 0.8), 0, 0.6)
    place(s, bubble(1500, 2700, 0.03, 0.35), 0.0)
    sounds["plink"] = room(s, 0.25, 0.12, 3)

    s = np.zeros(int(1.6 * RATE))
    place(s, click(), 0, 0.35)
    place(s, bubble(520, 1400, 0.06, 0.6), 0.0)
    place(s, bubble(560, 1500, 0.05, 0.5), 0.2, 0.28)
    place(s, bubble(600, 1550, 0.045, 0.45), 0.36, 0.14)
    sounds["pond"] = room(s, 0.9, 0.3, 4)

    s = np.zeros(int(1.0 * RATE))
    place(s, click(), 0, 0.4)
    place(s, bubble(700, 1800, 0.04, 0.4), 0.0)
    place(s, click(2600), 0.15, 0.4)
    place(s, bubble(480, 1250, 0.05, 0.45), 0.15, 0.85)
    sounds["twin"] = room(s, 0.5, 0.2, 5)

    s = np.zeros(int(1.1 * RATE))
    place(s, click(5200, 0.008, 0.9), 0, 0.5)
    place(s, bubble(900, 1500, 0.07, 0.9, shape=3, harmonics=((1, 1), (2.76, 0.4), (5.4, 0.18))), 0.0)
    sounds["glass"] = room(s, 0.4, 0.18, 6)

    s = np.zeros(int(2.2 * RATE))
    place(s, click(), 0, 0.3)
    place(s, bubble(380, 1050, 0.06, 0.6), 0.0)
    sounds["cave"] = room(s, 1.6, 0.55, 7)

    s = np.zeros(int(0.45 * RATE))
    place(s, bubble(2000, 3300, 0.022, 0.3), 0.0)
    sounds["tiny"] = room(s, 0.2, 0.1, 8)

    rng = np.random.default_rng(9)
    s = np.zeros(int(0.6 * RATE))
    pop = rng.standard_normal(int(0.03 * RATE)) * np.exp(-t_axis(0.03) / 0.006)
    pop = np.convolve(pop, np.ones(8) / 8, mode="same")
    place(s, pop, 0, 0.9)
    place(s, bubble(900, 1250, 0.04, 0.3), 0.004, 0.6)
    sounds["leaf"] = room(s, 0.3, 0.15, 9)

    s = np.zeros(int(1.0 * RATE))
    t = t_axis(0.8)
    wobble = 1 + 0.035 * np.sin(2 * np.pi * 22 * t) * np.exp(-t / 0.15)
    body = bubble(330, 900, 0.11, 0.8, shape=4)
    place(s, body * wobble[: len(body)], 0.0)
    sounds["bubble"] = room(s, 0.45, 0.16, 10)

    return sounds


def write(name, signal):
    pcm = (np.clip(signal, -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(pcm.tobytes())


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, signal in build().items():
        write(name, finish(signal, 0.4 if name == "tiny" else 0.62))
        print(f"{name}.wav")
