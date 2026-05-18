#!/usr/bin/env python3
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path


def run(cmd, capture=True, check=True):
    return subprocess.run(cmd, text=True, capture_output=capture, check=check)


def which(name):
    return shutil.which(name)


def ffprobe_duration(path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    out = run(cmd).stdout.strip()
    return float(out)


def to_hms(seconds):
    seconds = max(0.0, float(seconds))
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds - h * 3600 - m * 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def parse_hms(value):
    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        return float(value)
    parts = value.split(":")
    if len(parts) != 3:
        raise ValueError(f"Bad time value: {value}")
    h, m, s = parts
    return int(h) * 3600 + int(m) * 60 + float(s)


def validate_time_range(start, end, total_duration):
    if start < 0 or end < 0:
        raise ValueError("Start and end times must be non-negative")
    if start >= end:
        raise ValueError("Start time must be before end time")
    if start > total_duration:
        raise ValueError(
            f"Start time {to_hms(start)} is beyond input duration {to_hms(total_duration)}"
        )
    if end > total_duration:
        raise ValueError(
            f"End time {to_hms(end)} is beyond input duration {to_hms(total_duration)}"
        )


def add_review_times(decision):
    if 'start' in decision:
        decision['start_hms'] = to_hms(decision['start'])
    if 'end' in decision:
        decision['end_hms'] = to_hms(decision['end'])
    if 'duration' in decision:
        decision['duration_hms'] = to_hms(decision['duration'])
    return decision


def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def decode_mono_wav(src, dst):
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-ac", "1", "-ar", "16000", "-vn",
        str(dst),
    ]
    run(cmd)


def rms_for_window(frames, sample_width):
    if not frames:
        return 0.0
    import array
    if sample_width == 2:
        arr = array.array('h')
        arr.frombytes(frames)
        if not arr:
            return 0.0
        mean_sq = sum((x / 32768.0) ** 2 for x in arr) / len(arr)
        return math.sqrt(mean_sq)
    if sample_width == 1:
        arr = frames
        vals = [((b - 128) / 128.0) for b in arr]
        mean_sq = sum(v * v for v in vals) / len(vals)
        return math.sqrt(mean_sq)
    return 0.0


def speech_windows_from_wav(wav_path, step_sec=5.0, min_run_sec=180.0):
    windows = []
    with wave.open(str(wav_path), 'rb') as wf:
        fr = wf.getframerate()
        sw = wf.getsampwidth()
        total_frames = wf.getnframes()
        total_sec = total_frames / float(fr)
        chunk_frames = max(1, int(step_sec * fr))
        energies = []
        start = 0.0
        while True:
            frames = wf.readframes(chunk_frames)
            if not frames:
                break
            end = min(total_sec, start + step_sec)
            rms = rms_for_window(frames, sw)
            energies.append({"start": start, "end": end, "rms": rms})
            start = end
    if not energies:
        return []
    values = sorted(x['rms'] for x in energies)
    threshold = values[max(0, int(len(values) * 0.25) - 1)]
    speechish = [e for e in energies if e['rms'] >= threshold and e['rms'] <= (max(values) * 0.92 if max(values) else 1.0)]
    if not speechish:
        speechish = energies
    current = None
    for e in speechish:
        if current is None:
            current = {"start": e['start'], "end": e['end'], "samples": [e]}
            continue
        gap = e['start'] - current['end']
        if gap <= step_sec + 0.01:
            current['end'] = e['end']
            current['samples'].append(e)
        else:
            windows.append(current)
            current = {"start": e['start'], "end": e['end'], "samples": [e]}
    if current:
        windows.append(current)
    merged = []
    for w in windows:
        dur = w['end'] - w['start']
        if dur >= min_run_sec:
            avg = sum(s['rms'] for s in w['samples']) / len(w['samples'])
            merged.append({"start": w['start'], "end": w['end'], "duration": dur, "avg_rms": avg})
    if not merged:
        longest = max(windows, key=lambda w: w['end'] - w['start']) if windows else None
        if longest:
            dur = longest['end'] - longest['start']
            avg = sum(s['rms'] for s in longest['samples']) / len(longest['samples'])
            merged = [{"start": longest['start'], "end": longest['end'], "duration": dur, "avg_rms": avg}]
    return merged


def has_whisper():
    return which('whisper') is not None


def transcribe_clip(audio_path, out_prefix):
    cmd = [
        'whisper', str(audio_path),
        '--model', os.environ.get('WHISPER_MODEL', 'base'),
        '--output_format', 'txt',
        '--output_dir', str(Path(out_prefix).parent),
        '--fp16', 'False',
    ]
    run(cmd)
    txt = Path(out_prefix).with_suffix('.txt')
    if txt.exists():
        return txt.read_text()
    alt = Path(Path(out_prefix).parent, Path(audio_path).stem + '.txt')
    return alt.read_text() if alt.exists() else ''


def sermon_score(window, total_duration, transcript_text=''):
    mid = (window['start'] + window['end']) / 2.0
    pos = mid / total_duration if total_duration else 0.5
    duration_score = min(window['duration'] / 2400.0, 1.0) * 4.0
    middle_bias = 2.0 - abs(pos - 0.62) * 4.0
    energy_penalty = 0.0
    txt_score = 0.0
    text = transcript_text.lower()
    positive = [
        'turn with me', 'open your bibles', 'scripture', 'gospel', 'chapter',
        'verse', 'today we are', 'our text', 'sermon', 'message', 'lord', 'jesus'
    ]
    negative = [
        'welcome', 'announcement', 'offering', 'visiting with us', 'worship team',
        'let us stand', 'closing prayer', 'benediction'
    ]
    for token in positive:
        if token in text:
            txt_score += 0.6
    for token in negative:
        if token in text:
            txt_score -= 0.9
    return round(duration_score + middle_bias + energy_penalty + txt_score, 3)


def extract_clip(src, start, end, dst):
    cmd = ['ffmpeg', '-y', '-ss', to_hms(start), '-to', to_hms(end), '-i', str(src), '-c', 'copy', str(dst)]
    try:
        run(cmd)
    except subprocess.CalledProcessError:
        cmd = ['ffmpeg', '-y', '-ss', to_hms(start), '-to', to_hms(end), '-i', str(src), str(dst)]
        run(cmd)


def loudnorm_stats(src):
    cmd = [
        'ffmpeg', '-i', str(src), '-af',
        'highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f', 'null', '-'
    ]
    proc = run(cmd, capture=True, check=False)
    text = proc.stderr
    start = text.rfind('{')
    end = text.rfind('}')
    if start == -1 or end == -1 or end <= start:
        return None
    return json.loads(text[start:end+1])


def normalize_audio(src, dst, bitrate=None):
    stats = loudnorm_stats(src)
    base = 'highpass=f=80,acompressor=threshold=-18dB:ratio=2.5:attack=20:release=250'
    if stats:
        af = (
            base + ',' +
            'loudnorm=I=-16:TP=-1.5:LRA=11:' +
            f"measured_I={stats['input_i']}:measured_LRA={stats['input_lra']}:" +
            f"measured_TP={stats['input_tp']}:measured_thresh={stats['input_thresh']}:" +
            f"offset={stats['target_offset']}:linear=true:print_format=summary"
        )
    else:
        af = base + ',speechnorm=e=12.5:r=0.0001:l=1,alimiter=limit=-1.5dB'
    cmd = ['ffmpeg', '-y', '-i', str(src), '-af', af]
    if str(dst).lower().endswith('.mp3'):
        cmd += ['-c:a', 'libmp3lame', '-b:a', bitrate or '128k']
    else:
        cmd += ['-c:a', 'pcm_s16le']
    cmd += [str(dst)]
    run(cmd)
    return stats


def main():
    ap = argparse.ArgumentParser(description='Extract sermon audio from full church-service recording.')
    ap.add_argument('input')
    ap.add_argument('--output-dir', default='outputs/sermons')
    ap.add_argument('--format', choices=['wav', 'mp3'], default='wav')
    ap.add_argument('--bitrate', default='128k')
    ap.add_argument('--transcribe', choices=['auto', 'always', 'never'], default='auto')
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--keep-temp', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    src = Path(args.input).expanduser().resolve()
    if not src.exists():
        print(f'Input not found: {src}', file=sys.stderr)
        return 2

    ensure_dir(args.output_dir)
    out_dir = Path(args.output_dir).resolve()
    stem = src.stem
    temp_dir_obj = tempfile.TemporaryDirectory(prefix='sermon-audio-')
    temp_dir = Path(temp_dir_obj.name)

    total_duration = ffprobe_duration(src)
    wav16 = temp_dir / f'{stem}.mono16.wav'
    decode_mono_wav(src, wav16)
    candidates = speech_windows_from_wav(wav16)

    manual = args.start or args.end
    transcripts = {}
    should_transcribe = (args.transcribe == 'always') or (args.transcribe == 'auto' and has_whisper())

    if should_transcribe and not manual:
        for idx, win in enumerate(sorted(candidates, key=lambda x: x['duration'], reverse=True)[:4], 1):
            clip = temp_dir / f'{stem}.candidate{idx}.wav'
            extract_clip(src, win['start'], win['end'], clip)
            try:
                text = transcribe_clip(clip, clip)
            except Exception:
                text = ''
            transcripts[f'candidate_{idx}'] = text
            win['transcript_key'] = f'candidate_{idx}'

    if manual:
        start = parse_hms(args.start) if args.start else 0.0
        end = parse_hms(args.end) if args.end else total_duration
        try:
            validate_time_range(start, end, total_duration)
        except ValueError as exc:
            print(f'Invalid manual boundary: {exc}', file=sys.stderr)
            if not args.keep_temp:
                temp_dir_obj.cleanup()
            return 2
        decision = {
            'mode': 'manual_override',
            'start': start,
            'end': end,
            'duration': end - start,
        }
    else:
        scored = []
        for win in candidates:
            text = transcripts.get(win.get('transcript_key', ''), '')
            score = sermon_score(win, total_duration, text)
            enriched = dict(win)
            enriched['score'] = score
            scored.append(enriched)
        if not scored:
            scored = [{'start': 0.0, 'end': total_duration, 'duration': total_duration, 'avg_rms': 0.0, 'score': 0.0}]
        best = max(scored, key=lambda x: x['score'])
        pad_pre = 12.0
        pad_post = 18.0
        start = max(0.0, best['start'] - pad_pre)
        end = min(total_duration, best['end'] + pad_post)
        decision = {
            'mode': 'auto',
            'start': start,
            'end': end,
            'duration': end - start,
            'chosen_candidate': best,
            'all_candidates': scored,
            'transcription_used': should_transcribe,
        }
    add_review_times(decision)

    out_audio = out_dir / f'{stem}.sermon.{args.format}'
    segments_json = out_dir / f'{stem}.segments.json'
    decision_json = out_dir / f'{stem}.decision.json'
    transcript_txt = out_dir / f'{stem}.transcript.txt'
    raw_clip = temp_dir / f'{stem}.raw-sermon.wav'

    segments_json.write_text(json.dumps({'input': str(src), 'candidates': candidates}, indent=2))
    decision_json.write_text(json.dumps(decision, indent=2))
    if transcripts:
        transcript_txt.write_text('\n\n=====\n\n'.join(f'[{k}]\n{v}' for k, v in transcripts.items()))

    if args.dry_run:
        print(json.dumps({'decision': decision, 'segments': str(segments_json), 'decision_json': str(decision_json)}, indent=2))
        if not args.keep_temp:
            temp_dir_obj.cleanup()
        return 0

    extract_clip(src, decision['start'], decision['end'], raw_clip)
    stats = normalize_audio(raw_clip, out_audio, bitrate=args.bitrate)
    decision['output'] = str(out_audio)
    decision['normalization'] = stats or {'mode': 'fallback'}
    decision_json.write_text(json.dumps(decision, indent=2))

    print(json.dumps({
        'output': str(out_audio),
        'decision_json': str(decision_json),
        'segments_json': str(segments_json),
        'transcript_txt': str(transcript_txt) if transcripts else None,
        'start': to_hms(decision['start']),
        'end': to_hms(decision['end']),
    }, indent=2))

    if args.keep_temp:
        print(str(temp_dir))
    else:
        temp_dir_obj.cleanup()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
