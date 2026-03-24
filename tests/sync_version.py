#!/usr/bin/env python3
import json
from pathlib import Path
import sys

def sync():
    root = Path(__file__).parent.parent
    config_path = root / "src" / "ros2_dockergen" / "data" / "config.json"
    package_path = root / "package.json"
    
    if not config_path.exists():
        print(f"Error: {config_path} not found")
        sys.exit(1)
        
    with open(config_path, "r") as f:
        config = json.load(f)
    
    version = config.get("version")
    if not version:
        print("Error: No version found in config.json")
        sys.exit(1)
        
    print(f"Master version: {version}")
    
    # Sync package.json
    if package_path.exists():
        with open(package_path, "r") as f:
            package = json.load(f)
        
        if package.get("version") != version:
            print(f"Updating package.json: {package['version']} -> {version}")
            package["version"] = version
            with open(package_path, "w") as f:
                json.dump(package, f, indent=2)
                f.write("\n")
        else:
            print("package.json is already in sync.")
    
    print("Sync complete!")

if __name__ == "__main__":
    sync()
