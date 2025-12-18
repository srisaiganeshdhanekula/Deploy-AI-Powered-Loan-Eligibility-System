import React, { useEffect, useRef, useState } from 'react'

// VoiceAgentRealtime: captures microphone, streams PCM16/16k audio via WebSocket
// Displays partial transcripts, AI token stream, and plays incoming audio chunks (base64 WAV)

function floatTo16BitPCM(float32Array) {
  const l = float32Array.length
  const buf = new Int16Array(l)
  for (let i = 0; i < l; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]))
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return buf
}

function resampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate === inputSampleRate) {
    return buffer
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate
  const newLength = Math.round(buffer.length / sampleRateRatio)
  const result = new Float32Array(newLength)
  let offsetResult = 0
  let offsetBuffer = 0
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio)
    // average the input samples
    let accum = 0
    let count = 0
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i]
      count++
    }
    result[offsetResult] = count > 0 ? accum / count : 0
    offsetResult++
    offsetBuffer = nextOffsetBuffer
  }
  return result
}

export default function VoiceAgentRealtime() {
  const [connected, setConnected] = useState(false)
  const [partial, setPartial] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [aiTokens, setAiTokens] = useState('')
  const [eligibility, setEligibility] = useState(null)

  const wsRef = useRef(null)
  const audioCtxRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const sourceRef = useRef(null)
  const processorRef = useRef(null)

  useEffect(() => {
    return () => {
      stopStreaming()
    }
  }, [])

  const startStreaming = async () => {
    if (connected) return
    // Setup WebSocket
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000/voice/stream`
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      setConnected(true)
      console.log('WS open')
    }
    ws.onmessage = async (ev) => {
      try {
        const text = typeof ev.data === 'string'
        if (text) {
          const obj = JSON.parse(ev.data)
          if (obj.type === 'partial_transcript') {
            setPartial(obj.data)
          } else if (obj.type === 'final_transcript') {
            setFinalTranscript((s) => s + ' ' + obj.data)
          } else if (obj.type === 'ai_token') {
            setAiTokens((t) => t + obj.data)
          } else if (obj.type === 'audio_chunk') {
            // base64 WAV -> play
            const b64 = obj.data
            const byteStr = atob(b64)
            const bytes = new Uint8Array(byteStr.length)
            for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
            if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
            const ac = audioCtxRef.current
            try {
              const decoded = await ac.decodeAudioData(bytes.buffer)
              const src = ac.createBufferSource()
              src.buffer = decoded
              src.connect(ac.destination)
              src.start()
            } catch (e) {
              // Fallback: create blob and play via audio element
              const blob = new Blob([bytes], { type: 'audio/wav' })
              const url = URL.createObjectURL(blob)
              const a = new Audio(url)
              a.play()
            }
          } else if (obj.type === 'eligibility_result') {
            setEligibility(obj.data)
          }
        }
      } catch (err) {
        console.error('WS message parse error', err)
      }
    }
    ws.onclose = () => {
      setConnected(false)
      console.log('WS closed')
    }
    ws.onerror = (e) => {
      console.error('WS error', e)
    }
    wsRef.current = ws

    // Setup audio capture and send PCM16 16k
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtxRef.current = audioCtx
    const source = audioCtx.createMediaStreamSource(stream)
    sourceRef.current = source

    // Use ScriptProcessor (simple) with buffer size 4096
    const processor = audioCtx.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      // resample to 16000
      const resampled = resampleBuffer(input, audioCtx.sampleRate, 16000)
      const int16 = floatTo16BitPCM(resampled)
      // send as ArrayBuffer
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(int16.buffer)
      }
    }
    processorRef.current = processor
    source.connect(processor)
    processor.connect(audioCtx.destination)
  }

  const stopStreaming = () => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'end_of_session' }))
      } catch (e) {}
      wsRef.current.close()
      wsRef.current = null
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close()
      } catch (e) {}
      audioCtxRef.current = null
    }
    setConnected(false)
  }

  return (
    <div className="voice-agent">
      <h3>Voice Agent (Realtime)</h3>
      <div>
        <button onClick={startStreaming} disabled={connected}>Start</button>
        <button onClick={stopStreaming} disabled={!connected}>Stop</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <strong>Partial:</strong> {partial}
      </div>
      <div>
        <strong>Transcript:</strong> {finalTranscript}
      </div>
      <div>
        <strong>AI (tokens):</strong> {aiTokens}
      </div>
      <div>
        <strong>Eligibility:</strong> {eligibility === null ? '—' : (eligibility === null ? 'N/A' : Math.round(eligibility * 100) + '%')}
      </div>
    </div>
  )
}
