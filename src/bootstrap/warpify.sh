#!/bin/bash
#
# Remote Command Bootstrap Script
# Based on Warp.dev's warpify approach
#
# This script checks for tmux availability and system compatibility
# on the remote host.

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

_check_tmux() {
  TMUX_BIN=""

  # Check for user-installed tmux first
  if _find tmux; then
    TMUX_BIN="tmux"
    _log SshTmuxInstaller "\"user\""
  fi

  if [ -n "$TMUX_BIN" ]; then
    VER=$(command $TMUX_BIN -V 2>/dev/null | awk '{print $2}')

    if [ -z "$VER" ]; then
      _err "\"TmuxFailed\""
      return 1
    fi

    # Check version >= 2.9
    MIN_VER="2.9"
    if [ "$(printf '%s\n' "$VER" "$MIN_VER" | sort -V | head -n1)" = "$MIN_VER" ]; then
      # Version is OK
      echo "TMUX_OK:$TMUX_BIN:$VER"
      _system_details
      return 0
    else
      _err "{\"UnsupportedTmuxVersion\": $(_system_details)}"
      return 1
    fi
  else
    _err "{\"TmuxNotInstalled\": $(_system_details)}"
    return 1
  fi
}

# Main execution
_check_tmux
