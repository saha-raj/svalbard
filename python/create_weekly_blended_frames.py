import cv2
import numpy as np
import os

# --- Configuration ---
SOURCE_IMAGE_DIR = "assets/images/frames"
# Files must be named 01.webp, 02.webp, ..., 12.webp
MONTHLY_FILENAMES = [f"{i:02d}.webp" for i in range(1, 13)]

OUTPUT_DIR = "assets/images/frames/weekly"
OUTPUT_FILENAME_PREFIX = "week-"

# Number of intermediate frames to generate BETWEEN each key image
STANDARD_INTERMEDIATE_FRAMES = 3
SPECIAL_INTERMEDIATE_FRAMES = 7 # For February (02.webp) to March (03.webp) transition
# --- End Configuration ---

def create_blends():
    # Create output directory if it doesn\'t exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Ensured output directory exists: {OUTPUT_DIR}")

    # Load images
    images = []
    print("Loading monthly source images...")
    for fname in MONTHLY_FILENAMES:
        fpath = os.path.join(SOURCE_IMAGE_DIR, fname)
        if not os.path.exists(fpath):
            print(f"Error: Source image file not found: {fpath}")
            return
        img = cv2.imread(fpath)
        if img is None:
            print(f"Error: Could not load image {fpath}. Check file integrity and format.")
            return
        images.append(img.astype(np.float32))
        print(f"  Loaded {fpath} (shape: {img.shape})")

    # Verify all images have the same shape
    if not images:
        print("No images loaded.")
        return
        
    first_shape = images[0].shape
    for i, img in enumerate(images):
        if img.shape != first_shape:
            print(f"Error: Image {MONTHLY_FILENAMES[i]} has shape {img.shape}, but expected {first_shape}.")
            return

    print("All images loaded successfully and have matching dimensions.")

    # Generate blended frames
    generated_frame_count = 0
    num_source_images = len(images)

    print(f"Generating blended weekly frames...")

    for i in range(num_source_images):
        img1 = images[i]
        img2 = images[(i + 1) % num_source_images] # Loop back to the first image after the last

        current_month_filename = MONTHLY_FILENAMES[i]
        
        n_intermediate_frames = STANDARD_INTERMEDIATE_FRAMES
        if current_month_filename == "02.webp": # Transition from February to March
            n_intermediate_frames = SPECIAL_INTERMEDIATE_FRAMES
            print(f"  Applying special transition (7 intermediate frames) for {current_month_filename} -> {MONTHLY_FILENAMES[(i + 1) % num_source_images]}")
        else:
            print(f"  Applying standard transition (3 intermediate frames) for {current_month_filename} -> {MONTHLY_FILENAMES[(i + 1) % num_source_images]}")

        n_steps_this_transition = n_intermediate_frames + 1

        for k in range(n_steps_this_transition):
            alpha = 1.0 - (k / n_steps_this_transition)
            beta = 1.0 - alpha

            blended_img_float = cv2.addWeighted(img1, alpha, img2, beta, 0.0)
            output_img = np.clip(blended_img_float, 0, 255).astype(np.uint8)

            generated_frame_count += 1
            output_filename = os.path.join(OUTPUT_DIR, f"{OUTPUT_FILENAME_PREFIX}{generated_frame_count:02d}.webp")

            try:
                cv2.imwrite(output_filename, output_img)
            except Exception as e:
                print(f"Error: Failed to save frame {output_filename}: {e}")
                return
    
    print(f"Successfully generated {generated_frame_count} weekly frames in '{OUTPUT_DIR}'.")

if __name__ == "__main__":
    create_blends() 