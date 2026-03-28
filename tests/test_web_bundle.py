#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).parent.parent


def main():
    with tempfile.TemporaryDirectory(prefix="ros2-dockergen-webbundle-") as tmpdir:
        zip_path = Path(tmpdir) / "bundle.zip"
        generated_dir = Path(tmpdir) / "generated"
        runner = ROOT / "tests" / "web_bundle_runner.mjs"
        result = subprocess.run(
            ["node", str(runner), str(zip_path)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "web bundle runner failed")

        manifest = json.loads(Path(f"{zip_path}.json").read_text(encoding="utf-8"))
        if manifest["containerName"] != "ros2-humble":
            raise AssertionError("default container name should be ros2-humble for humble")

        with zipfile.ZipFile(zip_path, "r") as bundle:
            names = bundle.namelist()
            expected = ["Dockerfile", "docker-compose.yml", "README.md"]
            if names != expected:
                raise AssertionError(f"zip contents mismatch: {names!r} != {expected!r}")

            for name in expected:
                content = bundle.read(name).decode("utf-8")
                if content != manifest["files"][name]:
                    raise AssertionError(f"{name} extracted content does not match generated content")

            compose = bundle.read("docker-compose.yml").decode("utf-8")
            if "dockerfile: Dockerfile" not in compose:
                raise AssertionError("compose should reference Dockerfile exactly")

        generate = subprocess.run(
            ["node", "CI/generate.js", "--distro", "humble", "--variant", "ros-base", "--out", str(generated_dir)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if generate.returncode != 0:
            raise RuntimeError(generate.stderr.strip() or "CI/generate.js default generation failed")

        generated_compose = (generated_dir / "docker-compose.yml").read_text(encoding="utf-8")
        generated_readme = (generated_dir / "README.md").read_text(encoding="utf-8")
        if "  ros2-humble:" not in generated_compose:
            raise AssertionError("default generated compose should use ros2-humble as the service name")
        if "docker exec -it ros2-humble bash" not in generated_readme:
            raise AssertionError("default generated README should use ros2-humble in quick start")

    print("Web bundle tests passed.")


if __name__ == "__main__":
    sys.exit(main() or 0)
