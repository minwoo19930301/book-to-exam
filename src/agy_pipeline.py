"""
AGY Multimodal Agentic Pipeline Orchestrator
Coordinates AGY subagents to inspect textbook scan images directly via `view_file`
and assemble the zero-dependency interactive master HTML viewer.
"""

import os
import json
from typing import List, Dict, Any

def create_subagent_batch_tasks(image_dir: str, batch_size: int = 10) -> List[Dict[str, Any]]:
    """
    Slices all scanned book images into batches for parallel AGY subagent swarms.
    Each subagent receives an exact range of images to view and transcribe.
    """
    files = sorted([f for f in os.listdir(image_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    batches = []
    
    for i in range(0, len(files), batch_size):
        chunk = files[i:i + batch_size]
        batch_id = (i // batch_size) + 1
        prompt = f"""[AGY Subagent Task - Batch {batch_id}]
Inspect the following {len(chunk)} textbook scans using your native `view_file` capability:
Image Range: {chunk[0]} to {chunk[-1]}

For each image:
1. Directly inspect the image using `view_file`.
2. Extract the complete, unabridged, faithful textbook content (left page & right page).
3. Transcribe all classical Chinese characters, tables, diagrams, and [사료탐구] boxes.
4. Save the results as JSON to: ai_transcriptions/batch_{batch_id}.json
"""
        batches.append({
            "batch_id": batch_id,
            "images": chunk,
            "prompt": prompt
        })
        
    return batches

if __name__ == "__main__":
    import sys
    img_dir = sys.argv[1] if len(sys.argv) > 1 else "./scans"
    if os.path.exists(img_dir):
        tasks = create_subagent_batch_tasks(img_dir)
        print(f"[AGY Pipeline] Generated {len(tasks)} subagent swarm batch tasks.")
        print(f"Sample Prompt for Batch 1:\n{tasks[0]['prompt']}")
    else:
        print(f"Directory {img_dir} does not exist. Run with an image directory.")
