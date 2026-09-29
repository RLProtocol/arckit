#!/usr/bin/env bash
# Frames + soundtrack -> arccash.mp4 ; plus a narrated cut with the six neural TTS clips (edge-tts, en-US-AndrewNeural) placed at their scene times.
set -e
V="$(cd "$(dirname "$0")" && pwd)"
FF="C:/Users/Aayus/AppData/Local/Temp/claude/c--Users-Aayus-OneDrive-Desktop-ArcLock/12405d58-7d8b-40f5-8ee5-31d02c25644b/scratchpad/pw/node_modules/ffmpeg-static/ffmpeg.exe"
cd "$V"
# 1. music + sfx only
"$FF" -y -loglevel error -framerate 30 -i frames/f%05d.jpg -i sfx.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -c:a aac -b:a 192k -shortest -movflags +faststart arccash.mp4
# 2. narrated: delays in ms per clip (scene starts), voice slightly forward, soundtrack ducked under it
"$FF" -y -loglevel error -framerate 30 -i frames/f%05d.jpg -i sfx.wav \
  -i voice2/n0.wav -i voice2/n1.wav -i voice2/n2.wav -i voice2/n3.wav -i voice2/n4.wav -i voice2/n5.wav \
  -filter_complex "[2]adelay=400|400[v0];[3]adelay=4700|4700[v1];[4]adelay=12500|12500[v2];[5]adelay=25800|25800[v3];[6]adelay=34800|34800[v4];[7]adelay=49900|49900[v5];[v0][v1][v2][v3][v4][v5]amix=inputs=6:normalize=0,highpass=f=90,acompressor=threshold=-18dB:ratio=3:attack=10:release=120,volume=1.6[voice];[1]volume=0.55[bed];[bed][voice]amix=inputs=2:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -c:a aac -b:a 192k -shortest -movflags +faststart arccash-narrated.mp4
ls -la arccash.mp4 arccash-narrated.mp4
