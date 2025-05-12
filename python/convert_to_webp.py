import os
import glob
from PIL import Image

# --- Configuration ---
input_dir = "assets/images/frames"
# --- End Configuration ---

# Check if input directory exists
if not os.path.isdir(input_dir):
    print(f"Error: Input directory not found: {input_dir}")
    exit(1)

print(f"Searching for PNG files in: {input_dir}")

# Find all PNG files in the input directory
png_files = glob.glob(os.path.join(input_dir, "*.png"))

if not png_files:
    print(f"No PNG files found in {input_dir}.")
    exit(0)

print(f"Found {len(png_files)} PNG files. Converting to WEBP...")

converted_count = 0
error_count = 0

for png_path in png_files:
    try:
        # Extract the base name (e.g., "01") and extension
        base_name = os.path.splitext(os.path.basename(png_path))[0]
        # Construct the output WEBP path
        webp_path = os.path.join(input_dir, f"{base_name}.webp")

        # Open the PNG image
        with Image.open(png_path) as img:
            # Save the image as WEBP (lossless by default)
            # For lossy compression, add quality parameter: img.save(webp_path, 'webp', quality=80)
            img.save(webp_path, 'webp')
            print(f"  Successfully converted {png_path} -> {webp_path}")
            converted_count += 1

    except Exception as e:
        print(f"Error converting {png_path}: {e}")
        error_count += 1

print(f"Conversion complete.")
print(f"  Successfully converted: {converted_count}")
print(f"  Errors encountered: {error_count}") 