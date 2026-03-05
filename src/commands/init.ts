/**
 * c init - output shell init script for eval
 *
 * Usage: eval "$(c init)"
 */

const POSIX_INIT = `c() {
  if [ "$1" = "cd" ]; then
    shift
    local dir
    dir=$(command c dir "$@")
    if [ $? -eq 0 ] && [ -n "$dir" ]; then
      builtin cd "$dir"
    fi
  else
    command c "$@"
  fi
}`;

const FISH_INIT = `function c
  if test "$argv[1]" = "cd"
    set -e argv[1]
    set -l dir (command c dir $argv)
    if test $status -eq 0 -a -n "$dir"
      builtin cd $dir
    end
  else
    command c $argv
  end
end`;

export function initCommand(): void {
  const shell = process.env.SHELL || '';
  process.stdout.write(shell.includes('fish') ? FISH_INIT : POSIX_INIT);
}
