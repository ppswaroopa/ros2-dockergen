import json
import re
from pathlib import Path

class GeneratorCore:
    def __init__(self, config):
        self._cfg = config

    @classmethod
    def from_file(cls, file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return cls(json.load(f))

    def _sub(self, text, variables):
        def replace(match):
            key = match.group(1)
            if key not in variables:
                raise KeyError(f"Unknown template variable: {{{key}}}")
            return str(variables[key])
        return re.sub(r"\{(\w+)\}", replace, text)

    def _sub_all(self, arr, variables):
        return [self._sub(s, variables) for s in arr]

    def _resolve_env_map(self, env_map, variables):
        return {
            key: self._sub(value, variables) if isinstance(value, str) else value
            for key, value in env_map.items()
        }

    def _shell_quote(self, value):
        return "'" + value.replace("'", "'\"'\"'") + "'"

    def _home_for(self, username, is_root):
        return "/root" if is_root else f"/home/{username}"

    def _visible_package_names(self, packages):
        names = []
        for pkg_key in packages:
            pkg = self._cfg["ros_packages"].get(pkg_key, {})
            names.append(pkg.get("label", pkg_key))
        return names

    def default_username(self):
        return self._cfg["defaults"]["username"]

    def default_uid(self):
        return self._cfg["defaults"]["uid"]

    def default_user_type(self):
        return self._cfg["defaults"]["user_type"]

    def default_target_platform(self):
        return self._cfg["defaults"].get("target_platform", "amd64")

    def default_workspace(self, username, user_type):
        template = self._cfg["defaults"]["root_workspace"] if user_type == "root" else self._cfg["defaults"]["user_workspace"]
        return self._sub(template, {"username": username})

    def default_container_name(self, distro):
        return self._sub(self._cfg["defaults"]["container_name"], {"distro": distro})

    def _target_platform(self, config_or_key=None):
        key = "amd64"
        if isinstance(config_or_key, dict):
            key = config_or_key.get("target_platform", config_or_key.get("targetPlatform", "amd64"))
        elif config_or_key:
            key = config_or_key
        return self._cfg.get("target_platforms", {}).get(key, self._cfg.get("target_platforms", {}).get("amd64", {}))

    def _target_key(self, config):
        explicit = config.get("target_platform", config.get("targetPlatform"))
        if explicit:
            return explicit
        host_os = config.get("host_os", config.get("hostOs"))
        if host_os:
            host_cfg = self._cfg.get("host_os", {}).get(host_os, {})
            if host_cfg.get("target_platform"):
                return host_cfg["target_platform"]
        return "amd64"

    def is_jetson_target(self, target_platform):
        return bool(self._target_platform(target_platform).get("jetson"))

    def get_base_image(self, distro, variant, has_cuda, target_platform="amd64"):
        d = self._cfg["distros"].get(distro)
        if not d:
            raise ValueError(f"Unknown distro: {distro}")

        target = self._target_platform(target_platform)
        if has_cuda and not target.get("jetson"):
            return self._sub(self._cfg["cuda_base_image"], {
                "cuda_version": d["cuda_version"],
                "ubuntu_image_suffix": d["ubuntu_image_suffix"]
            })

        if target.get("force_ros_base_for_variants"):
            return self._sub(self._cfg["variants"]["ros-base"]["base_image"], {"distro": distro})

        v = self._cfg["variants"].get(variant)
        if not v:
            raise ValueError(f"Unknown variant: {variant}")
            
        return self._sub(v["base_image"], {"distro": distro})

    def resolve_ros_package_apt(self, pkg_key, distro, target_platform="amd64"):
        pkg = self._cfg["ros_packages"].get(pkg_key)
        if not pkg:
            return []

        variables = {"distro": distro}
        target = self._target_platform(target_platform)

        if target.get("jetson") and "jetson_apt" in pkg:
            return self._sub_all(pkg.get("jetson_apt", []), variables)

        if pkg.get("apt_by_distros"):
            apt_by_distro = pkg["apt_by_distros"]
            if distro not in apt_by_distro:
                raise ValueError(f"Package {pkg_key} is not supported on distro {distro}")
            return self._sub_all(apt_by_distro[distro], variables)

        if pkg.get("switches_base_image"):
            return []

        if "skip_on_distros" in pkg and distro in pkg["skip_on_distros"]:
            return []

        names = self._sub_all(pkg.get("apt", []), variables)
        
        extra = pkg.get("extra_apt_on_distros")
        if extra and distro in extra.get("distros", []):
            names.extend(self._sub_all(extra.get("apt", []), variables))
            
        return names

    def resolve_config(self, config):
        """
        Takes a raw user configuration and applies relationship rules,
        automatic selections, and OS-specific scaffolding.
        Returns a NEW resolved configuration dictionary.
        """
        res = config.copy()
        distro = res["distro"]
        variant = res["variant"]
        packages = set(res.get("packages", []))
        tools = set(res.get("tools", []))
        target_key = self._target_key(res)
        target = self._target_platform(target_key)
        warnings = list(res.get("warnings", []))

        if target.get("blocks_packages"):
            blocked = set(target["blocks_packages"])
            removed = sorted(packages & blocked)
            packages -= blocked
            if removed:
                labels = self._visible_package_names(removed)
                warnings.append(
                    "{} does not support {}; removed from the generated config.".format(
                        target.get("label", target_key), ", ".join(labels)
                    )
                )

        tier1 = set(target.get("tier1_distros", target.get("supported_distros", [])))
        if tier1 and distro not in tier1:
            warnings.append(target.get(
                "experimental_warning",
                f"{distro} is experimental on {target.get('label', target_key)}."
            ))
        
        # 1. Variant Implications
        v_cfg = self._cfg["variants"].get(variant, {})
        if "implies_packages" in v_cfg:
            for p_key in v_cfg["implies_packages"]:
                if p_key == "gazebo_distro_specific":
                    # Resolve which gazebo to use for this distro
                    d_cfg = self._cfg["distros"].get(distro, {})
                    p_key = d_cfg.get("gazebo_pkg", "gz_sim")
                packages.add(p_key)
                
        # 2. GUI Dependencies (if any selected package is a GUI package, enable x11)
        has_gui_pkg = False
        for p_key in packages:
            p_cfg = self._cfg["ros_packages"].get(p_key, {})
            if p_cfg.get("is_gui"):
                has_gui_pkg = True
                break
        
        if has_gui_pkg:
            tools.add("x11")
            
        res["packages"] = sorted(packages)
        res["tools"] = sorted(tools)
        res["target_platform"] = target_key
        res["warnings"] = warnings
        return res

    def _variant_upgrade_apt(self, distro, variant, target_platform):
        target = self._target_platform(target_platform)
        if variant == "ros-base":
            return []
        if target.get("force_ros_base_for_variants"):
            return [f"ros-{distro}-{variant}"]
        if variant == "desktop-full":
            return self._sub_all(self._cfg["variants"]["desktop-full"].get("extra_apt", []), {"distro": distro})
        return []

    def build_dockerfile(self, config):
        distro = config["distro"]
        variant = config["variant"]
        packages = sorted(config["packages"])
        tools = sorted(config["tools"])
        username = config["username"]
        uid = config["uid"]
        workspace = config["workspace"]
        user_type = config.get("userType", config.get("user_type"))
        target_platform = self._target_key(config)

        is_root = user_type == "root"
        has_cuda = "cuda" in packages or "tensorrt" in packages
        target = self._target_platform(target_platform)
        has_nvidia_runtime = has_cuda or target.get("nvidia_runtime", False)
        d = self._cfg["distros"][distro]
        variables = {
            "distro": distro,
            "cuda_version": d["cuda_version"],
            "ubuntu_image_suffix": d["ubuntu_image_suffix"]
        }
        
        L = []
        def ln(s): L.append(s)
        def gap(): L.append("")
        
        ln("# =============================================================")
        ln(f"# ROS2 {d['label']} Dockerfile")
        ln(f"# Generated by ros2-dockergen v{self._cfg['version']}")
        ln("# =============================================================")
        gap()
        ln(f"FROM {self.get_base_image(distro, variant, has_cuda, target_platform)}")
        gap()

        if has_cuda and not target.get("jetson"):
            ln("# ── Install ROS2 on top of CUDA base ───────────────────────")
            ln("ENV DEBIAN_FRONTEND=noninteractive")
            ln("RUN apt-get update && apt-get install -y \\")
            for p in self._cfg["cuda_ros_install_apt"]:
                ln(f"    {p} \\")
            ln(f"    && curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \\")
            ln("    -o /usr/share/keyrings/ros-archive-keyring.gpg && \\")
            ln("    echo \"deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \\")
            ln("    http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main\" \\")
            ln("    > /etc/apt/sources.list.d/ros2.list && \\")
            ln(f"    apt-get update && apt-get install -y ros-{distro}-{variant} && \\")
            ln("    rm -rf /var/lib/apt/lists/*")
            gap()
            
        ln("ENV DEBIAN_FRONTEND=noninteractive")
        ln("SHELL [\"/bin/bash\", \"-c\"]")
        gap()
        
        variant_apt = self._variant_upgrade_apt(distro, variant, target_platform)
        if not (has_cuda and not target.get("jetson")) and variant_apt:
            ln(f"# ── Upgrade to {variant} ─────────────────────────────────────")
            ln("RUN apt-get update && apt-get install -y \\")
            for p in variant_apt:
                ln(f"    {p} \\")
            ln("    && rm -rf /var/lib/apt/lists/*")
            gap()
            
        if "locale" in tools:
            locale = self._cfg["tools"]["locale"]
            ln("# ── Locale ───────────────────────────────────────────────────")
            ln("RUN apt-get update && apt-get install -y {} && \\".format(" ".join(locale["apt"])))
            ln(f"    {locale['post_install_run']} && \\")
            ln("    rm -rf /var/lib/apt/lists/*")
            for k, v in locale.get("env", {}).items():
                ln(f"ENV {k}={v}")
            gap()
            
        sys_apt = list(self._cfg["system_apt_always"])
        for tool_key in tools:
            if tool_key in ["locale", "zsh", "ssh"]:
                continue
            tool = self._cfg["tools"].get(tool_key)
            if tool and tool.get("apt") and not tool.get("ros_build_tool"):
                sys_apt.extend(tool["apt"])
        if not is_root:
            sys_apt.append("sudo")
            
        ln("# ── System packages ──────────────────────────────────────────")
        ln("RUN apt-get update && apt-get install -y \\")
        for p in sys_apt:
            ln(f"    {p} \\")
        ln("    && rm -rf /var/lib/apt/lists/*")
        gap()
        
        build_apt = list(self._cfg["ros_build_tools_always"])
        for tool_key in tools:
            tool = self._cfg["tools"].get(tool_key)
            if tool and tool.get("ros_build_tool") and tool.get("apt"):
                build_apt.extend(tool["apt"])
                
        ln("# ── ROS2 build tools ─────────────────────────────────────────")
        ln("RUN apt-get update && apt-get install -y \\")
        for p in build_apt:
            ln(f"    {p} \\")
        ln("    && rm -rf /var/lib/apt/lists/*")
        if "rosdep" in tools:
            gap()
            ln("RUN {}".format(self._sub(self._cfg["tools"]["rosdep"]["post_install_run"], variables)))
        gap()
        
        if "zsh" in tools:
            ln("# ── Zsh + Oh-My-Zsh ──────────────────────────────────────────")
            ln("RUN apt-get update && apt-get install -y zsh && rm -rf /var/lib/apt/lists/*")
            gap()
            
        ros_apt = []
        for pkg_key in packages:
            ros_apt.extend(self.resolve_ros_package_apt(pkg_key, distro, target_platform))
        if ros_apt:
            ln("# ── ROS2 packages ────────────────────────────────────────────")
            ln("RUN apt-get update && apt-get install -y \\")
            for p in ros_apt:
                ln(f"    {p} \\")
            ln("    && rm -rf /var/lib/apt/lists/*")
            gap()
            
        for pkg_key in packages:
            pkg = self._cfg["ros_packages"].get(pkg_key)
            if pkg and pkg.get("env"):
                for k, v in self._resolve_env_map(pkg["env"], variables).items():
                    ln(f"ENV {k}={v}")
                gap()
                
        if "ssh" in tools:
            ssh = self._cfg["tools"]["ssh"]
            ln("# ── SSH server ────────────────────────────────────────────────")
            ln("RUN apt-get update && apt-get install -y {} && \\".format(" ".join(ssh["apt"])))
            ln(f"    {ssh['post_install_run']} && \\")
            ln("    rm -rf /var/lib/apt/lists/*")
            ln(f"EXPOSE {ssh['expose_port']}")
            gap()
            
        home = self._home_for(username, is_root)

        if not is_root:
            ln("# ── Non-root user ────────────────────────────────────────────")
            ln(f"ARG UID={uid}")
            ln(f"ARG GID={uid}")
            ln("RUN if getent group ${GID} >/dev/null; then \\")
            ln(f"        groupmod -n {username} $(getent group ${{GID}} | cut -d: -f1); \\")
            ln(f"    else groupadd -g ${{GID}} {username}; fi && \\")
            ln("    if getent passwd ${UID} >/dev/null; then \\")
            ln(f"        usermod -l {username} -m -d /home/{username} $(getent passwd ${{UID}} | cut -d: -f1); \\")
            ln(f"    else useradd -m -u ${{UID}} -g ${{GID}} -s /bin/bash {username}; fi")
            if "sudo" in tools:
                ln(f"RUN echo \"{username} ALL=(ALL) NOPASSWD:ALL\" >> /etc/sudoers")
            gap()
            ln(f"RUN mkdir -p {workspace}/src && chown -R {username}:{username} {workspace}")
            gap()
            ln(f"USER {username}")
        else:
            ln(f"RUN mkdir -p {workspace}/src")
            
        ln(f"WORKDIR {workspace}")
        gap()

        if "zsh" in tools:
            zsh_run = self._sub(self._cfg["tools"]["zsh"]["post_install_run"], {"home": home})
            ln("RUN {}".format(zsh_run))
            gap()
        
        if "bashrc" in tools or "zsh" in tools:
            ln("# ── Shell setup ───────────────────────────────────────────────")
            if "bashrc" in tools:
                ln(f"RUN echo \"source /opt/ros/{distro}/setup.bash\" >> {home}/.bashrc")
                for pkg_key in packages:
                    pkg = self._cfg["ros_packages"].get(pkg_key)
                    if pkg and pkg.get("env"):
                        for k, v in self._resolve_env_map(pkg["env"], variables).items():
                            ln(f"RUN echo {self._shell_quote(f'export {k}={v}')} >> {home}/.bashrc")
            if "zsh" in tools:
                ln(f"RUN echo \"source /opt/ros/{distro}/setup.bash\" >> {home}/.zshrc")
                for pkg_key in packages:
                    pkg = self._cfg["ros_packages"].get(pkg_key)
                    if pkg and pkg.get("env"):
                        for k, v in self._resolve_env_map(pkg["env"], variables).items():
                            ln(f"RUN echo {self._shell_quote(f'export {k}={v}')} >> {home}/.zshrc")
            gap()
            
        for tool_key in tools:
            tool = self._cfg["tools"].get(tool_key)
            if tool and tool.get("env"):
                for k, v in self._resolve_env_map(tool["env"], variables).items():
                    ln(f"ENV {k}={v}")
                gap()
                
        if has_nvidia_runtime:
            title = "Jetson NVIDIA runtime" if target.get("jetson") else "NVIDIA GPU runtime"
            ln(f"# ── {title} ─────────────────────────────────────")
            ln("ENV NVIDIA_VISIBLE_DEVICES=all")
            ln("ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics")
            gap()
            
        ln("CMD [\"/bin/bash\"]")
        return "\n".join(L)

    def build_compose(self, config):
        distro = config["distro"]
        packages = sorted(config["packages"])
        tools = sorted(config["tools"])
        workspace = config["workspace"]
        container_name = config.get("containerName", config.get("container_name"))
        user_type = config.get("userType", config.get("user_type"))
        host_os = config.get("host_os", config.get("hostOs", "linux"))
        target_platform = self._target_key(config)

        is_root = user_type == "root"
        has_cuda = "cuda" in packages or "tensorrt" in packages
        target = self._target_platform(target_platform)
        has_nvidia_runtime = has_cuda or target.get("nvidia_runtime", False)
        
        L = []
        def ln(s): L.append(s)
        
        ln(f"# docker-compose.yml — generated by ros2-dockergen v{self._cfg['version']}")
        ln("services:")
        ln(f"  {container_name}:")
        ln("    build:")
        ln("      context: .")
        ln("      dockerfile: Dockerfile")
        if not is_root:
            ln("      args:")
            ln("        UID: ${UID:-1000}")
            ln("        GID: ${GID:-1000}")
        ln(f"    image: ros2-{distro}-{container_name}:latest")
        ln(f"    container_name: {container_name}")
        ln(f"    hostname: {container_name}")
        if target.get("arch") == "arm64" and target.get("docker_platform"):
            ln(f"    platform: {target['docker_platform']}")
        ln("    stdin_open: true")
        ln("    tty: true")
        ln("    restart: unless-stopped")
        ln("    network_mode: host")
        ln("    environment:")
        ln(f"      - ROS_DISTRO={distro}")
        
        # ── Environment ─────────────────────────────────────────────
        for tool_key in tools:
            tool = self._cfg["tools"].get(tool_key)
            if tool and tool.get("compose_env"):
                for k, v in self._resolve_env_map(tool["compose_env"], {"distro": distro}).items():
                    ln(f"      - {k}={v}")
                    
        if "x11" in tools:
            os_cfg = self._cfg["host_os"].get(host_os, self._cfg["host_os"]["linux"])
            if "x11_env" in os_cfg:
                for k, v in os_cfg["x11_env"].items():
                    ln(f"      - {k}={v}")
        
        if has_nvidia_runtime:
            ln("      - __GLX_VENDOR_LIBRARY_NAME=nvidia")

        for pkg_key in packages:
            pkg = self._cfg["ros_packages"].get(pkg_key)
            if pkg and pkg.get("env"):
                for k, v in self._resolve_env_map(pkg["env"], {"distro": distro}).items():
                    ln(f"      - {k}={v}")
                    
        # ── Volumes ─────────────────────────────────────────────────
        ln("    volumes:")
        ln(f"      - .:{workspace}:rw")
        for tool_key in tools:
            tool = self._cfg["tools"].get(tool_key)
            if tool and tool.get("compose_volumes"):
                for v in tool["compose_volumes"]:
                    ln(f"      - {v}")

        if "x11" in tools:
            os_cfg = self._cfg["host_os"].get(host_os, self._cfg["host_os"]["linux"])
            if "x11_volumes" in os_cfg:
                for v in os_cfg["x11_volumes"]:
                    ln(f"      - {v}")
                    
        if has_nvidia_runtime:
            ln("    runtime: nvidia")
            
        return "\n".join(L)


    def build_readme(self, config):
        distro = config["distro"]
        variant = config["variant"]
        packages = sorted(config["packages"])
        tools = sorted(config["tools"])
        username = config["username"]
        workspace = config["workspace"]
        container_name = config.get("containerName", config.get("container_name"))
        user_type = config.get("userType", config.get("user_type"))
        target_platform = self._target_key(config)

        d = self._cfg["distros"][distro]
        target = self._target_platform(target_platform)
        warnings = config.get("warnings", [])

        notes = []
        if "cuda" in packages or "tensorrt" in packages:
            notes.append("NVIDIA GPU support requires working host drivers and NVIDIA Container Toolkit/runtime.")
        if target.get("jetson"):
            notes.append("Jetson targets must be run on Jetson hardware with JetPack and NVIDIA Container Runtime installed.")
            notes.append("Validate CUDA/TensorRT workloads on the target Jetson hardware.")
        notes.extend(warnings)
        notes_block = ""
        if notes:
            notes_block = "## Notes\n" + "".join(f"- {note}\n" for note in notes) + "\n"

        cross_build_note = ""
        if target.get("arch") == "arm64":
            cross_build_note = f"""## Build ARM64 Image
```bash
docker buildx create --use --name ros2-arm64-builder || docker buildx use ros2-arm64-builder
docker buildx build --platform {target.get('docker_platform', 'linux/arm64')} -t {container_name}:arm64 --load .
```

"""

        pkgs_str = ", ".join(packages) if packages else "none"
        tools_str = ", ".join(tools) if tools else "none"
        u = f"{username} ({user_type})"

        return f"""# ROS2 {d['label']} Docker Environment

Generated by **ros2-dockergen v{self._cfg['version']}**

## What's Inside
| | |
|---|---|
| **ROS2 Distro** | {distro} ({variant}) |
| **Packages** | {pkgs_str} |
| **Dev Tools** | {tools_str} |
| **User** | {u} |
| **Workspace** | {workspace} |

## Prerequisites
- Docker Engine ≥ 24 / Docker Desktop
- docker compose v2
{notes_block}{cross_build_note}## Run
```bash
docker compose build
docker compose up -d
docker exec -it {container_name} bash

cd {workspace}
colcon build --symlink-install
source install/setup.bash

docker compose down
```

---
*Generated by ros2-dockergen v{self._cfg['version']}*
"""

    def get_distros(self):
        return [{"value": k, "label": v["label"], "ubuntu": v["ubuntu"], "recommended": v.get("recommended", False), "is_lts": v.get("is_lts", False)} 
                for k, v in self._cfg["distros"].items()]

    def get_target_platforms(self):
        return [{"value": k, "label": v["label"], "description": v["description"], "default_distro": v.get("default_distro"), "arch": v.get("arch", "amd64")} 
                for k, v in self._cfg.get("target_platforms", {}).items()]

    def get_variants(self):
        return [{"value": k, "label": v["label"], "description": v["description"]} 
                for k, v in self._cfg["variants"].items()]

    def get_ros_package_choices(self):
        return [{"value": k, "label": v["label"], "description": v["description"]} 
                for k, v in self._cfg["ros_packages"].items()]

    def get_tool_choices(self):
        return [{"value": k, "label": v["label"], "description": v["description"], "default": v.get("default", False)} 
                for k, v in self._cfg["tools"].items()]
