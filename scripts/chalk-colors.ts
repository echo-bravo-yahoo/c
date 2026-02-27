import chalk from 'chalk';

const colors = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
  'gray', 'grey',
] as const;

const modifiers = [
  'bold', 'dim', 'italic', 'underline', 'inverse', 'strikethrough',
] as const;

console.log(chalk.underline('Foreground colors'));
for (const color of colors) {
  console.log(`  ${color.padEnd(16)} ${(chalk[color] as (s: string) => string)('The quick brown fox')}`);
}

console.log();
console.log(chalk.underline('Background colors'));
for (const color of colors) {
  const bg = `bg${color[0].toUpperCase()}${color.slice(1)}` as keyof typeof chalk;
  if (typeof chalk[bg] === 'function') {
    console.log(`  ${String(bg).padEnd(16)} ${(chalk[bg] as (s: string) => string)('The quick brown fox')}`);
  }
}

console.log();
console.log(chalk.underline('Modifiers'));
for (const mod of modifiers) {
  console.log(`  ${mod.padEnd(16)} ${(chalk[mod] as (s: string) => string)('The quick brown fox')}`);
}
