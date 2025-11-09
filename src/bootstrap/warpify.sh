#!/bin/bash
#
# Remote Command Bootstrap Script
# Based on Warp.dev's warpify approach
#
# This script checks for tmux availability and automatically installs/updates it if needed

_find() {
  command -v "$1" >/dev/null 2>&1
}

_log() {
  _msg=$(printf '{"hook": "%s", "value": %s}' "$1" "$2" | command -p od -An -v -tx1 | command -p tr -d " \n")
  printf '\033\120\044\144%s\234' "$_msg"
}

_err() {
  _log RemoteWarpificationIsUnavailable "$1"
}

_system_details() {
  OS=$(uname)
  PKG=""

  if [ "$OS" = "Darwin" ]; then
    if _find brew; then
      PKG="homebrew"
    fi
  elif [ "$OS" = "Linux" ]; then
    if _find pacman; then
      PKG="pacman"
    elif _find zypper; then
      PKG="zypper"
    elif _find dnf; then
      PKG="dnf"
    elif _find yum && _find yumdownloader; then
      PKG="yum"
    elif _find apt; then
      PKG="apt"
    fi
  fi

  RA="no_root_access"
  if command -v sudo >/dev/null && { sudo -vn && sudo -ln; } 2>&1 | grep -E 'may run|a password' > /dev/null; then
    RA="can_run_sudo"
  elif [ "$(id -u)" -eq 0 ] && [ "$(whoami)" = "root" ]; then
    RA="is_root"
  fi

  WH=$( [ -w ~ ] && echo true || echo false )

  printf '%s' "{\"os\": \"$OS\", \"pkg\": \"$PKG\", \"shell\": \"$(basename $SHELL)\", \"root_access\": \"$RA\", \"writable_home\": $WH}"
}

_install_tmux() {
  local pkg="$1"
  local root_access="$2"

  echo "INSTALLING_TMUX:$pkg:$root_access" >&2

  case "$pkg" in
    apt)
      if [ "$root_access" = "is_root" ]; then
        apt-get update -qq && apt-get install -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo apt-get update -qq && sudo apt-get install -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    dnf)
      if [ "$root_access" = "is_root" ]; then
        dnf install -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo dnf install -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    yum)
      if [ "$root_access" = "is_root" ]; then
        yum install -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo yum install -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    pacman)
      if [ "$root_access" = "is_root" ]; then
        pacman -Sy --noconfirm tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo pacman -Sy --noconfirm tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    zypper)
      if [ "$root_access" = "is_root" ]; then
        zypper install -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo zypper install -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    homebrew)
      brew install tmux >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac

  return $?
}

_upgrade_tmux() {
  local pkg="$1"
  local root_access="$2"

  echo "UPGRADING_TMUX:$pkg:$root_access" >&2

  case "$pkg" in
    apt)
      if [ "$root_access" = "is_root" ]; then
        apt-get update -qq && apt-get install --only-upgrade -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo apt-get update -qq && sudo apt-get install --only-upgrade -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    dnf)
      if [ "$root_access" = "is_root" ]; then
        dnf upgrade -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo dnf upgrade -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    yum)
      if [ "$root_access" = "is_root" ]; then
        yum update -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo yum update -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    pacman)
      if [ "$root_access" = "is_root" ]; then
        pacman -Syu --noconfirm tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo pacman -Syu --noconfirm tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    zypper)
      if [ "$root_access" = "is_root" ]; then
        zypper update -y tmux >/dev/null 2>&1
      elif [ "$root_access" = "can_run_sudo" ]; then
        sudo zypper update -y tmux >/dev/null 2>&1
      else
        return 1
      fi
      ;;
    homebrew)
      brew upgrade tmux >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac

  return $?
}

_check_and_install_tmux() {
  # Get system details first
  local sys_info=$(_system_details)
  local OS=$(echo "$sys_info" | grep -o '"os": "[^"]*"' | cut -d'"' -f4)
  local PKG=$(echo "$sys_info" | grep -o '"pkg": "[^"]*"' | cut -d'"' -f4)
  local RA=$(echo "$sys_info" | grep -o '"root_access": "[^"]*"' | cut -d'"' -f4)

  TMUX_BIN=""

  # Check for user-installed tmux first
  if _find tmux; then
    TMUX_BIN="tmux"
    VER=$(command $TMUX_BIN -V 2>/dev/null | awk '{print $2}')

    if [ -z "$VER" ]; then
      echo "TMUX_FAILED" >&2
      _err "\"TmuxFailed\""
      return 1
    fi

    # Check version >= 2.9
    MIN_VER="2.9"
    if [ "$(printf '%s\n' "$VER" "$MIN_VER" | sort -V | head -n1)" = "$MIN_VER" ]; then
      # Version is OK
      echo "TMUX_OK:$TMUX_BIN:$VER"
      echo "$sys_info"
      return 0
    else
      # Version too old, try to upgrade
      echo "TMUX_TOO_OLD:$VER:UPGRADING" >&2

      if [ -n "$PKG" ] && [ "$RA" != "no_root_access" ]; then
        if _upgrade_tmux "$PKG" "$RA"; then
          # Check version after upgrade
          VER_NEW=$(tmux -V 2>/dev/null | awk '{print $2}')
          if [ -n "$VER_NEW" ] && [ "$(printf '%s\n' "$VER_NEW" "$MIN_VER" | sort -V | head -n1)" = "$MIN_VER" ]; then
            echo "TMUX_UPGRADED:$VER_NEW"
            echo "$sys_info"
            return 0
          else
            echo "TMUX_UPGRADE_FAILED:$VER_NEW" >&2
            _err "{\"UnsupportedTmuxVersion\": $sys_info, \"tried_upgrade\": true}"
            return 1
          fi
        else
          echo "TMUX_UPGRADE_FAILED:NO_PERMISSION" >&2
          _err "{\"UnsupportedTmuxVersion\": $sys_info, \"upgrade_failed\": true}"
          return 1
        fi
      else
        echo "TMUX_UPGRADE_SKIPPED:NO_PKG_MANAGER_OR_ROOT" >&2
        _err "{\"UnsupportedTmuxVersion\": $sys_info, \"cannot_upgrade\": true}"
        return 1
      fi
    fi
  else
    # Tmux not installed, try to install
    echo "TMUX_NOT_FOUND:INSTALLING" >&2

    if [ -n "$PKG" ] && [ "$RA" != "no_root_access" ]; then
      if _install_tmux "$PKG" "$RA"; then
        # Verify installation
        if _find tmux; then
          VER_NEW=$(tmux -V 2>/dev/null | awk '{print $2}')
          MIN_VER="2.9"
          if [ -n "$VER_NEW" ] && [ "$(printf '%s\n' "$VER_NEW" "$MIN_VER" | sort -V | head -n1)" = "$MIN_VER" ]; then
            echo "TMUX_INSTALLED:$VER_NEW"
            echo "$sys_info"
            return 0
          else
            echo "TMUX_INSTALLED_BUT_TOO_OLD:$VER_NEW" >&2
            _err "{\"TmuxInstalledButTooOld\": $sys_info, \"version\": \"$VER_NEW\"}"
            return 1
          fi
        else
          echo "TMUX_INSTALLATION_FAILED:NOT_FOUND_AFTER_INSTALL" >&2
          _err "{\"TmuxInstallationFailed\": $sys_info}"
          return 1
        fi
      else
        echo "TMUX_INSTALLATION_FAILED:INSTALL_COMMAND_FAILED" >&2
        _err "{\"TmuxInstallationFailed\": $sys_info, \"install_failed\": true}"
        return 1
      fi
    else
      echo "TMUX_INSTALLATION_SKIPPED:NO_PKG_MANAGER_OR_ROOT" >&2
      _err "{\"TmuxNotInstalled\": $sys_info, \"cannot_install\": true}"
      return 1
    fi
  fi
}

# Main execution
_check_and_install_tmux
