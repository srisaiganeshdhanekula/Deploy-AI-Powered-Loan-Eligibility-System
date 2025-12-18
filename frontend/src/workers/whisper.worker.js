/* eslint-disable no-restricted-globals */
import { pipeline, env } from '@xenova/transformers';

// Skip local model checks
env.allowLocalModels = false;
env.useBrowserCache = true;

class AutomaticSpeechRecognitionPipeline {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny.en';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    const message = event.data;

    try {
        if (message.type === 'load') {
            // Load the model
            await AutomaticSpeechRecognitionPipeline.getInstance((data) => {
                self.postMessage({
                    type: 'download',
                    data: data
                });
            });
            self.postMessage({ type: 'ready' });
        } else if (message.type === 'generate') {
            // Run inference
            const transcriber = await AutomaticSpeechRecognitionPipeline.getInstance();

            const output = await transcriber(message.audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english',
                task: 'transcribe',
                return_timestamps: false,
            });

            self.postMessage({
                type: 'result',
                data: output.text
            });
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            data: error.message
        });
    }
});
