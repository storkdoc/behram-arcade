#!/bin/bash
# ingest.sh id=hash ... : copy generated clip to raw/<id>.mp4 and make a review strip
A=/cursor/stores/user/grok-bot/agents/ce027a8c-54ee-46e4-a953-c9c3d7953587/assets
for kv in "$@"; do id=${kv%%=*}; h=${kv#*=}; cp $A/$h*.mp4 raw/$id.mp4 && ./sheet.sh raw/$id.mp4 >/dev/null; echo "$id=$h" >> ingest.log; done
