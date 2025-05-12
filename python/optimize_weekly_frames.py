import cv2
import os
import shutil

# --- Configuration ---
FRAMES_DIR = "assets/images/frames/weekly"
BACKUP_DIR = "assets/images/frames/weekly_backup"
# Quality: 0-100. Higher is better quality, larger file. 80-90 is often a good balance.
WEBP_QUALITY = 85 
# --- End Configuration ---

def optimize_webp_frames():
    if not os.path.isdir(FRAMES_DIR):
        print(f"Error: Frames directory not found: {FRAMES_DIR}")
        return

    # Create backup directory if it doesn't exist
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)
        print(f"Created backup directory: {BACKUP_DIR}")

    print(f"Optimizing .webp files in '{FRAMES_DIR}' with quality={WEBP_QUALITY}...")
    processed_files = 0
    failed_files = 0

    for filename in os.listdir(FRAMES_DIR):
        if filename.lower().endswith(".webp"):
            filepath = os.path.join(FRAMES_DIR, filename)
            backup_filepath = os.path.join(BACKUP_DIR, filename)

            try:
                # Backup the original file first
                shutil.copy2(filepath, backup_filepath)
                # print(f"  Backed up '{filename}' to '{BACKUP_DIR}'")

                img = cv2.imread(filepath)
                if img is None:
                    print(f"Warning: Could not read image '{filepath}'. Skipping.")
                    failed_files += 1
                    continue

                # Define imwrite parameters for WEBP quality
                params = [cv2.IMWRITE_WEBP_QUALITY, WEBP_QUALITY]
                
                # Overwrite the original file with the optimized version
                success = cv2.imwrite(filepath, img, params)
                
                if success:
                    original_size = os.path.getsize(backup_filepath)
                    new_size = os.path.getsize(filepath)
                    reduction = ((original_size - new_size) / original_size) * 100 if original_size > 0 else 0
                    print(f"  Optimized '{filename}': {original_size/1024:.1f}KB -> {new_size/1024:.1f}KB (Reduction: {reduction:.1f}%)")
                    processed_files += 1
                else:
                    print(f"Warning: Failed to write optimized image '{filepath}'. Original restored from backup.")
                    # Restore from backup if write failed
                    shutil.move(backup_filepath, filepath) # Move back, effectively restoring
                    failed_files += 1

            except Exception as e:
                print(f"Error processing file '{filepath}': {e}")
                failed_files += 1
                # Attempt to restore from backup if an exception occurred mid-process
                if os.path.exists(backup_filepath):
                    try:
                        shutil.move(backup_filepath, filepath)
                        print(f"  Restored '{filename}' from backup due to error.")
                    except Exception as backup_e:
                        print(f"  Critical error: Failed to restore '{filename}' from backup: {backup_e}")
                        
    print(f"\nOptimization complete.")
    print(f"  Processed: {processed_files} files")
    print(f"  Failed:    {failed_files} files")
    if processed_files > 0:
        print(f"Original files are backed up in: {BACKUP_DIR}")

if __name__ == "__main__":
    optimize_webp_frames() 