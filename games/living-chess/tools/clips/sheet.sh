#!/bin/bash
# contact sheet of 8 frames from a clip
f=$1; o=review/$(basename $f .mp4).png
ffmpeg -v error -y -i $f -vf "fps=8/$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f | awk '{print $1}'),scale=200:200,tile=8x1" -frames:v 1 $o && echo $o
