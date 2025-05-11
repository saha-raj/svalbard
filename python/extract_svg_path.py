import xml.etree.ElementTree as ET
import os

# --- Configuration: Hardcoded Paths ---
# You can change these defaults if your file names/locations differ.
DEFAULT_SVG_FILE_PATH = "assets/images/svalbard_placeholder.svg"
OUTPUT_PATH_DATA_FILE = "assets/data/custom_ground_path.txt"
# --- End Configuration ---

def extract_path_data_from_svg(svg_file_path, path_id, output_file_path):
    """
    Extracts the 'd' attribute from a specific path element in an SVG file
    and saves it to a text file.
    """
    try:
        tree = ET.parse(svg_file_path)
        root = tree.getroot()
        
        namespace = ''
        if '}' in root.tag:
            namespace = root.tag.split('}')[0] + '}'

        target_path_element = None
        for path_element in root.findall(f'.//{namespace}path'):
            if path_element.get('id') == path_id:
                target_path_element = path_element
                break
        
        if target_path_element is None:
            for elem in root.iter():
                if elem.tag.endswith('path') and elem.get('id') == path_id:
                    target_path_element = elem
                    break
            
            if target_path_element is None:
                 print(f"Error: Path element with ID '{path_id}' not found in '{svg_file_path}'.")
                 print("Please ensure the ID is correct and the element exists.")
                 path_ids_found = []
                 for path_elem in root.findall(f'.//{namespace}path'):
                     _id = path_elem.get('id')
                     if _id:
                         path_ids_found.append(_id)
                 if not path_ids_found:
                      for elem_iter in root.iter():
                          if elem_iter.tag.endswith('path') and elem_iter.get('id'):
                              path_ids_found.append(elem_iter.get('id'))
                 if path_ids_found:
                     print(f"Available path IDs found: {', '.join(list(set(path_ids_found)))}")
                 else:
                     print("No path elements with IDs found in the SVG.")
                 return

        path_d_attribute = target_path_element.get('d')

        if path_d_attribute:
            # Ensure the output directory exists
            os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
            with open(output_file_path, 'w') as f:
                f.write(path_d_attribute)
            print(f"Successfully extracted path data from ID '{path_id}' in '{svg_file_path}' to '{output_file_path}'")
        else:
            print(f"Error: Path element with ID '{path_id}' found, but it does not have a 'd' attribute.")

    except FileNotFoundError:
        print(f"Error: SVG file not found at '{svg_file_path}'")
    except ET.ParseError:
        print(f"Error: Could not parse the SVG file. Ensure it's a valid XML/SVG.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    print(f"Using default SVG input path: {DEFAULT_SVG_FILE_PATH}")
    print(f"Outputting path data to: {OUTPUT_PATH_DATA_FILE}")
    
    path_element_id = input(f"Enter the ID of the <path> element in '{DEFAULT_SVG_FILE_PATH}' to extract (e.g., Shape 3): ")
    
    if not path_element_id:
        print("Error: Path element ID cannot be empty.")
    else:
        extract_path_data_from_svg(DEFAULT_SVG_FILE_PATH, path_element_id, OUTPUT_PATH_DATA_FILE)
        print(f"\nIf successful, the path data is in '{OUTPUT_PATH_DATA_FILE}'.")
        print("The JavaScript file will attempt to load this path automatically.")
