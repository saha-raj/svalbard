import cv2
import numpy as np
import os

# --- Configuration ---
image_files = [
    "assets/images/tundra_fall.png",    # Image 1
    "assets/images/tundra_winter.png",  # Image 2
    "assets/images/tundra_spring.png",  # Image 3
    "assets/images/tundra_summer.png"   # Image 4 (will blend back to Image 1)
]
output_dir = "assets/images/frames"
n_intermediate_frames = 2  # Number of frames to generate BETWEEN each key image
# --- End Configuration ---

n_steps_per_transition = n_intermediate_frames + 1 # Includes the starting frame

# Create output directory if it doesn't exist
os.makedirs(output_dir, exist_ok=True)
print(f"Ensured output directory exists: {output_dir}")

# Load images
images = []
print("Loading images...")
for i, fname in enumerate(image_files):
    if not os.path.exists(fname):
        print(f"Error: Input image file not found: {fname}")
        print("Please ensure the image files are in the same directory as the script.")
        exit(1)
    img = cv2.imread(fname)
    if img is None:
        print(f"Error: Could not load image {fname}. Check file integrity and format.")
        exit(1)

    # Store image (convert to float for precise blending)
    images.append(img.astype(np.float32))
    print(f"  Loaded {fname} (shape: {img.shape})")

# Verify all images have the same shape
first_shape = images[0].shape
for i, img in enumerate(images):
    if img.shape != first_shape:
        print(f"Error: Image {image_files[i]} has shape {img.shape}, but expected {first_shape}.")
        exit(1)

print("All images loaded successfully and have matching dimensions.")

# Generate blended frames
frame_count = 0
num_images = len(images)

print(f"Generating {num_images * n_steps_per_transition} frames...")

for i in range(num_images):
    img1 = images[i]
    # Get the next image, looping back to the first one after the last
    img2 = images[(i + 1) % num_images]
    img1_name = os.path.splitext(image_files[i])[0]
    img2_name = os.path.splitext(image_files[(i + 1) % num_images])[0]

    print(f"  Blending {img1_name} -> {img2_name}...")

    # Generate frames for the current transition
    for k in range(n_steps_per_transition):
        # Calculate alpha (weight for img1) and beta (weight for img2)
        # alpha goes from 1.0 down to (but not including) 0.0
        alpha = 1.0 - (k / n_steps_per_transition)
        beta = 1.0 - alpha

        # Perform weighted addition
        blended_img_float = cv2.addWeighted(img1, alpha, img2, beta, 0.0)

        # Convert back to uint8 for saving
        output_img = np.clip(blended_img_float, 0, 255).astype(np.uint8)

        # Determine frame number (1-based) and filename
        frame_num = frame_count + 1
        output_filename = os.path.join(output_dir, f"{frame_num:02d}.png")

        # Save the frame
        try:
            cv2.imwrite(output_filename, output_img)
            # print(f"    Saved {output_filename} (alpha={alpha:.2f})")
        except Exception as e:
            print(f"Error: Failed to save frame {output_filename}: {e}")
            # Optionally exit or handle error differently
            exit(1)

        frame_count += 1

print(f"Successfully generated {frame_count} frames in '{output_dir}'.")
