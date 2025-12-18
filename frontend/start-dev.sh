#!/bin/bash
export DANGEROUSLY_DISABLE_HOST_CHECK=true
cd "$(dirname "$0")"
npm start
