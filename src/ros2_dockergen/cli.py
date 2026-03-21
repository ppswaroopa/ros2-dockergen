#!/usr/bin/env python3
"""
ros2-dockergen — Interactive CLI wizard.
Generates Dockerfile, docker-compose.yml and README.md for ROS2 projects.
"""

import sys
import os
import signal
import argparse
import re
import readline as _rl  # noqa: F401
import json
from pathlib import Path
from importlib import resources

from .core import GeneratorCore

# -- Resource Loading ---------------------------------------------------------

def load_config():
    try:
        traversable = resources.files('ros2_dockergen.data').joinpath('config.json')
        with traversable.open('r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"error: could not load config.json: {e}", file=sys.stderr)
        sys.exit(1)

_CONFIG_DATA = load_config()
_CORE        = GeneratorCore(_CONFIG_DATA)
_VERSION     = _CONFIG_DATA["version"]

# -- ANSI colour helpers -------------------------------------------------------

_IS_TTY = sys.stdout.isatty()

def _c(code: str, s: str) -> str:
    return f"\033[{code}m{s}\033[0m" if _IS_TTY else s

def bold(s):      return _c("1",    s)
def dim(s):       return _c("2",    s)
def cyan(s):      return _c("36",   s)
def green(s):     return _c("32",   s)
def yellow(s):    return _c("33",   s)
def magenta(s):   return _c("35",   s)
def red(s):       return _c("31",   s)
def gray(s):      return _c("90",   s)
def underline(s): return _c("4",    s)

# -- Cursor helpers (TTY only) -------------------------------------------------

def _write(s: str) -> None:
    sys.stdout.write(s)
    sys.stdout.flush()

def _up(n: int) -> None:
    if _IS_TTY and n > 0: _write(f"\033[{n}A")

def _clear_down() -> None:
    if _IS_TTY: _write("\033[J")

# -- Quit / Ctrl-C -------------------------------------------------------------

class _Quit(Exception):
    pass

def _handle_sigint(sig, frame):
    raise _Quit()

signal.signal(signal.SIGINT, _handle_sigint)

def _quit():
    _write("\033[?25h")
    print(f"\n{yellow('  Wizard cancelled — no files were written.')}\n")
    sys.exit(0)

# -- Panel state ---------------------------------------------------------------

W = 60

_selections = {
    "distro":    None,
    "variant":   None,
    "packages":  None,
    "tools":     None,
    "user":      None,
    "workspace": None,
    "container": None,
    "output":    None,
}

_STEP_LABELS = [
    "Distro", "Variant", "Packages", "Dev tools",
    "User", "Workspace", "Container", "Output dir",
]

_panel_lines = 0

def _vis_len(s: str) -> int:
    return len(re.sub(r"\033\[[0-9;]*m", "", s))

def _pad(s: str, width: int) -> str:
    return s + " " * max(0, width - _vis_len(s))

def _summarise(lst: list, n: int = 3) -> str:
    if not lst:
        return dim("none")
    shown = ", ".join(lst[:n])
    rest  = len(lst) - n
    return (green(shown) + dim(f" +{rest} more")) if rest > 0 else green(shown)

def _render_panel(current_step: int) -> list[str]:
    SEP = cyan("─" * W)
    rows: list[str] = []

    rows.append(cyan("╔" + "═" * (W - 2) + "╗"))
    title = f"  🤖  ros2-dockergen  v{_VERSION}"
    rows.append(cyan("║") + bold(_pad(title, W - 2)) + cyan("║"))
    rows.append(cyan("╚" + "═" * (W - 2) + "╝"))
    rows.append("")

    labels = ["Distro", "Variant", "Packages", "Tools",
              "User", "Workspace", "Container", "Output"]
    values = [
        green(_selections["distro"])                       if _selections["distro"]    else None,
        green(_selections["variant"])                      if _selections["variant"]   else None,
        _summarise(_selections["packages"] or [], 3)       if _selections["packages"] is not None else None,
        _summarise(_selections["tools"]    or [], 4)       if _selections["tools"]    is not None else None,
        _selections["user"]                                if _selections["user"]      else None,
        green(_selections["workspace"])                    if _selections["workspace"] else None,
        green(_selections["container"])                    if _selections["container"] else None,
        _selections["output"]                              if _selections["output"]    else None,
    ]

    has_any = any(v is not None for v in values)
    if not has_any:
        rows.append(dim("  No selections yet"))
    else:
        for label, val in zip(labels, values):
            if val is not None:
                rows.append(f"  {dim(label.ljust(11))} {val}")

    rows.append("")
    rows.append(SEP)

    step_str   = cyan(f"  [{current_step}/{len(_STEP_LABELS)}]")
    step_name  = bold(_STEP_LABELS[current_step - 1])
    pending    = _STEP_LABELS[current_step:]
    next_str   = (dim("  Next: " + " → ".join(pending[:3])
                      + (" …" if len(pending) > 3 else ""))
                  if pending else "")
    rows.append(f"{step_str}  {step_name}{next_str}")
    rows.append(SEP)
    rows.append("")
    return rows

def _draw_panel(current_step: int) -> None:
    global _panel_lines
    if not _IS_TTY:
        return
    if _panel_lines > 0:
        _up(_panel_lines)
        _clear_down()
    rows = _render_panel(current_step)
    _panel_lines = len(rows)
    _write("\n".join(rows) + "\n")

def _erase_question(line_count: int) -> None:
    if _IS_TTY and line_count > 0:
        _up(line_count)
        _clear_down()

def _ask(prompt: str, default: str = "") -> str:
    hint    = dim(f" [{default}]") if default else ""
    qhint   = gray("  (q to quit)")
    _write(f"{prompt}{hint}{qhint} › ")
    try:
        line = sys.stdin.readline()
    except KeyboardInterrupt:
        raise _Quit()
    if not line:
        raise _Quit()
    val = line.strip()
    if val.lower() == "q":
        raise _Quit()
    return val or default

def _select_one(question: str, hint: str, choices: list[dict]) -> str:
    def _print(error: str | None) -> int:
        lines = []
        lines.append(bold(question))
        lines.append(dim(f"  {hint}"))
        lines.append("")
        for i, c in enumerate(choices, 1):
            lines.append(f"  {cyan(f'{i:2}.')}  {c['name']}")
        lines.append("")
        if error:
            lines.append(red(f"  ✗  {error}"))
        _write("\n".join(lines) + "\n")
        return len(lines)

    q_lines = _print(None)
    prompt  = dim(f"  Enter 1–{len(choices)}")

    while True:
        try:
            raw = _ask(prompt)
        except _Quit:
            _quit()

        idx = int(raw) - 1 if raw.isdigit() else -1
        if 0 <= idx < len(choices):
            _erase_question(q_lines + 1)
            return choices[idx]["value"]
        _erase_question(q_lines + 1)
        q_lines = _print(f"Please enter a number between 1 and {len(choices)}")

def _select_many(question: str, hint: str, choices: list[dict]) -> list[str]:
    defaults = [str(i + 1) for i, c in enumerate(choices) if c.get("checked")]

    def _print(error: str | None) -> int:
        lines = []
        lines.append(bold(question))
        lines.append(dim(f"  {hint}"))
        lines.append("")
        for i, c in enumerate(choices, 1):
            bullet = green("●") if c.get("checked") else dim("○")
            lines.append(f"  {bullet} {cyan(f'{i:2}.')}  {c['name']}")
        lines.append("")
        lines.append(dim("  ● = on by default  |  numbers e.g. 1,4,7  |"
                         "  a = all  |  n = none  |  Enter = defaults"))
        if error:
            lines.append(red(f"  ✗  {error}"))
        _write("\n".join(lines) + "\n")
        return len(lines)

    def_str = ",".join(defaults) if defaults else "n"
    q_lines = _print(None)
    prompt  = dim("  Selection")

    while True:
        try:
            raw = _ask(prompt, def_str)
        except _Quit:
            _quit()

        val = raw or def_str
        if val.lower() == "a":
            _erase_question(q_lines + 1)
            return [c["value"] for c in choices]
        if val.lower() == "n":
            _erase_question(q_lines + 1)
            return []

        parts = [p.strip() for p in val.split(",")]
        if all(p.isdigit() and 1 <= int(p) <= len(choices) for p in parts):
            _erase_question(q_lines + 1)
            seen: set[int] = set()
            result = []
            for p in parts:
                idx = int(p) - 1
                if idx not in seen:
                    seen.add(idx)
                    result.append(choices[idx]["value"])
            return result

        _erase_question(q_lines + 1)
        q_lines = _print(f"Use comma-separated numbers 1–{len(choices)}, 'a', or 'n'")

def _input_line(label: str, hint: str, default: str,
                validate=None) -> str:
    def _print(error: str | None) -> int:
        lines = []
        lines.append(bold(label))
        if hint:
            lines.append(dim(f"  {hint}"))
        if error:
            lines.append(red(f"  ✗  {error}"))
        _write("\n".join(lines) + "\n")
        return len(lines)

    q_lines = _print(None)

    while True:
        try:
            raw = _ask("  ›", default)
        except _Quit:
            _quit()

        val = raw or default
        if validate:
            err = validate(val)
            if err is not True:
                _erase_question(q_lines + 1)
                q_lines = _print(err)
                continue

        _erase_question(q_lines + 1)
        return val

def _confirm(question: str, default: bool = False) -> bool:
    hint = "Y/n" if default else "y/N"
    try:
        raw = _ask(f"{bold(question)} {dim(f'[{hint}]')}", "y" if default else "n")
    except _Quit:
        _quit()
    return raw.lower().startswith("y")

# -- Build choice lists from _CORE ---------------------------------------------

def _distro_choices() -> list[dict]:
    result = []
    for d in _CORE.get_distros():
        rec   = "  (recommended)" if d["recommended"] else ""
        label = f"{d['label'].ljust(8)} — Ubuntu {d['ubuntu']} LTS{rec}"
        result.append({"value": d["value"], "name": label})
    return result

def _variant_choices() -> list[dict]:
    return [
        {"value": v["value"],
         "name": f"{v['label'].ljust(13)} {v['description']}"}
        for v in _CORE.get_variants()
    ]

def _package_choices() -> list[dict]:
    return [
        {"value": p["value"],
         "name": f"{p['label'].ljust(16)} {p['description']}"}
        for p in _CORE.get_ros_package_choices()
    ]

def _tool_choices() -> list[dict]:
    return [
        {"value": t["value"],
         "name": f"{t['label'].ljust(11)} {t['description']}",
         "checked": t["default"]}
        for t in _CORE.get_tool_choices()
    ]

# -- Final summary -------------------------------------------------------------

def _print_done(cfg: dict, abs_out: Path) -> None:
    SEP      = cyan("─" * W)
    packages = cfg["packages"]
    tools    = cfg["tools"]
    has_cuda = "cuda" in packages or "tensorrt" in packages

    print(f"\n{SEP}")
    print(bold("  ✅  Files generated"))
    print(SEP)
    print(f"  {dim('Distro   ')}  {green(cfg['distro'])} / {green(cfg['variant'])}")
    print(f"  {dim('User     ')}  "
          + (yellow("root") if cfg["user_type"] == "root"
             else green(cfg["username"])))
    print(f"  {dim('Workspace')}  {cfg['workspace']}")
    print(f"  {dim('Container')}  {cfg['container_name']}")
    if has_cuda:
        print(f"  {dim('GPU      ')}  {magenta('CUDA / NVIDIA')}")
    if packages:
        print(f"  {dim('Packages ')}  {_summarise(sorted(packages), 8)}")
    if tools:
        print(f"  {dim('Tools    ')}  {_summarise(sorted(tools), 8)}")
    print(SEP)
    print()
    print(f"  {bold('Written to')}  {underline(str(abs_out))}")
    print(f"     {green('✔')}  Dockerfile")
    print(f"     {green('✔')}  docker-compose.yml")
    print(f"     {green('✔')}  README.md")
    print()
    print(bold("  🚀  Next steps"))
    print(f"     {cyan(f'cd {abs_out}')}")
    print(f"     {cyan('docker compose build')}")
    print(f"     {cyan('docker compose up -d')}")
    cname = cfg["container_name"]
    print(f"     {cyan(f'docker exec -it {cname} bash')}")
    print()

# -- Main wizard ---------------------------------------------------------------

def _wizard() -> None:
    _draw_panel(1)

    distro = _select_one(
        "Which ROS2 distribution?",
        "Determines the base image and available package versions.",
        _distro_choices(),
    )
    _selections["distro"] = distro
    _draw_panel(2)

    variant = _select_one(
        "Which base image variant?",
        "Larger variants include more pre-installed tools but produce bigger images.",
        _variant_choices(),
    )
    _selections["variant"] = variant
    _draw_panel(3)

    sel_pkgs = _select_many(
        "Which ROS2 packages to install?",
        "Installed via apt. Select none to start with a clean base.",
        _package_choices(),
    )
    _selections["packages"] = sel_pkgs
    _draw_panel(4)

    sel_tools = _select_many(
        "Which developer tools to include?",
        "Pre-checked items are recommended for most ROS2 workflows.",
        _tool_choices(),
    )
    _selections["tools"] = sel_tools
    _draw_panel(5)

    user_type = _select_one(
        "Run the container as:",
        "Non-root matches your host UID and avoids volume permission issues.",
        [
            {"value": "user", "name": "Non-root user  (recommended)"},
            {"value": "root", "name": "Root           (simpler, not recommended for dev)"},
        ],
    )

    username = "ros"
    uid      = 1000
    if user_type == "user":
        username = _input_line(
            "Username inside the container",
            "Creates a Linux user account with this name.",
            "ros",
            lambda v: (True if re.match(r"^[a-z_][a-z0-9_-]{0,30}$", v)
                       else "Lowercase letters, digits, _ or - (max 31 chars)"),
        )
        raw_uid = _input_line(
            "UID for the user",
            "Match your host UID to avoid file permission issues (run `id -u`).",
            "1000",
            lambda v: True if v.isdigit() else "Must be a positive integer",
        )
        uid = int(raw_uid)

    _selections["user"] = (
        yellow("root") if user_type == "root"
        else f"{green(username)} {dim(f'(uid {uid})')}"
    )
    _draw_panel(6)

    workspace = _input_line(
        "Workspace path inside the container",
        "Absolute path — this will be mounted from your host.",
        "/ros2_ws",
        lambda v: True if v.startswith("/") else "Must be an absolute path starting with /",
    )
    _selections["workspace"] = green(workspace)
    _draw_panel(7)

    container_name = _input_line(
        "Container / service name",
        "Used as the docker-compose service name and container hostname.",
        f"ros2-{distro}",
        lambda v: (True if re.match(r"^[a-z0-9][a-z0-9_-]*$", v)
                   else "Lowercase letters, digits, _ or - (must start with letter/digit)"),
    )
    _selections["container"] = green(container_name)
    _draw_panel(8)

    output_dir = _input_line(
        "Output directory",
        "Where to write the files. Created if it does not exist.",
        f"./{container_name}",
        None,
    )
    _selections["output"] = output_dir

    cfg = {
        "distro":         distro,
        "variant":        variant,
        "packages":       set(sel_pkgs),
        "tools":          set(sel_tools),
        "user_type":      user_type,
        "username":       username,
        "uid":            uid,
        "workspace":      workspace,
        "container_name": container_name,
    }

    abs_out = Path(output_dir).resolve()
    try:
        abs_out.mkdir(parents=True, exist_ok=True)
        (abs_out / "Dockerfile").write_text(
            _CORE.build_dockerfile(cfg), encoding="utf-8")
        (abs_out / "docker-compose.yml").write_text(
            _CORE.build_compose(cfg), encoding="utf-8")
        (abs_out / "README.md").write_text(
            _CORE.build_readme(cfg), encoding="utf-8")
    except OSError as exc:
        print(red(f"\n  ✗  Could not write files: {exc}"), file=sys.stderr)
        sys.exit(1)

    if _IS_TTY and _panel_lines > 0:
        _up(_panel_lines)
        _clear_down()

    _print_done(cfg, abs_out)

    show = _confirm("  Print Dockerfile to terminal?", default=False)
    if show:
        print()
        print(cyan("─" * W))
        print(bold("  Dockerfile"))
        print(cyan("─" * W))
        print((abs_out / "Dockerfile").read_text(encoding="utf-8"))

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="ros2-dockergen",
        description="Generate a Dockerfile, docker-compose.yml and README for a ROS2 project.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--version", "-v",
        action="version",
        version=f"%(prog)s {_VERSION}",
    )
    parser.parse_args()

    try:
        _wizard()
    except _Quit:
        _quit()
    except KeyboardInterrupt:
        _quit()

if __name__ == "__main__":
    main()
