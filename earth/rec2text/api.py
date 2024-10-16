#!/bin/python3
import os
import time
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import whisper

app = FastAPI()

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Set this to ["*"] to allow all origins, or specify your trusted origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

whisper = whisper.load_model("medium.en")

@app.post("/speechToText")
async def speech_to_text(file: UploadFile = File(...)):
    try:
        # Save the uploaded audio file locally
        audio_path = "temp_audio.wav"
        with open(audio_path, "wb") as audio_file:
            audio_file.write(file.file.read())

        # Wait for the file to be fully written
        while os.path.getsize(audio_path) == 0:
            time.sleep(0.1)  # Adjust the sleep duration as needed

        # Use whisper to convert speech to text
        text = whisper.transcribe(audio_path, language="en")['text']

        # Return the transcribed text
        return text

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9000)
