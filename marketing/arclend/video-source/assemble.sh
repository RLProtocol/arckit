#!/usr/bin/env bash
# Frames + soundtrack -> arclend.mp4 ; plus a narrated cut (edge-tts en-US-AndrewNeural) with clips placed at scene starts.
set -e
V="$(cd "$(dirname "$0")" && pwd)"
FF="C:/Users/Aayus/AppData/Local/Temp/claude/c--Users-Aayus-OneDrive-Desktop-ArcLock/12405d58-7d8b-40f5-8ee5-31d02c25644b/scratchpad/pw/node_modules/ffmpeg-static/ffmpeg.exe"
cd "$V"
"$FF" -y -loglevel error -framerate 30 -i frames/f%05d.jpg -i sfx.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -c:a aac -b:a 192k -shortest -movflags +faststart arclend.mp4
"$FF" -y -loglevel error -framerate 30 -i frames/f%05d.jpg -i sfx.wav \
  -i voice/n0.wav -i voice/n1.wav -i voice/n2.wav -i voice/n3.wav -i voice/n4.wav -i voice/n5.wav \
  -filter_complex "[2]adelay=400|400[v0];[3]adelay=4700|4700[v1];[4]adelay=15700|15700[v2];[5]adelay=30200|30200[v3];[6]adelay=40700|40700[v4];[7]adelay=53300|53300[v5];[v0][v1][v2][v3][v4][v5]amix=inputs=6:normalize=0,highpass=f=90,acompressor=threshold=-18dB:ratio=3:attack=10:release=120,volume=1.4[voice];[1]volume=0.5[bed];[bed][voice]amix=inputs=2:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -c:a aac -b:a 192k -shortest -movflags +faststart arclend-narrated.mp4
ls -la arclend.mp4 arclend-narrated.mp4
