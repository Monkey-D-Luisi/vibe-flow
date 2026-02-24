const BRANCH_NAME_PATTERN = /^[a-zA-Z0-9._/-]+$/;
const LABEL_NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;
const HEX_COLOR_PATTERN = /^[0-9a-fA-F]{6}$/;
const SHELL_META = /[;&|`$(){}!<>"'\\~\n\r]/;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function buildTaskBranchName(taskId: string, slug: string): string {
  return `task/${taskId}-${slug}`;
}

export function assertValidBranchName(branch: string): void {
  assert(branch.startsWith('task/'), `Invalid branch "${branch}": must start with "task/"`);

  const suffix = branch.slice('task/'.length);
  assert(suffix.length > 0, `Invalid branch "${branch}": missing branch suffix`);
  assert(
    suffix.length <= 100,
    `Invalid branch "${branch}": suffix must be <= 100 characters`,
  );
  assert(
    BRANCH_NAME_PATTERN.test(branch),
    `Invalid branch "${branch}": only letters, numbers, ".", "_", "/", "-" are allowed`,
  );
  assert(!branch.includes('..'), `Invalid branch "${branch}": must not contain ".."`);
  assert(!branch.includes('//'), `Invalid branch "${branch}": must not contain "//"`);
  assert(!branch.endsWith('/'), `Invalid branch "${branch}": must not end with "/"`);
}

export function assertValidPrTitle(title: string): void {
  assert(title.length > 0, 'Invalid PR title: title cannot be empty');
  assert(title.length <= 256, 'Invalid PR title: maximum length is 256 characters');
  assert(!SHELL_META.test(title), 'Invalid PR title: shell metacharacters are not allowed');
}

export function assertValidLabelName(labelName: string): void {
  assert(labelName.length > 0, 'Invalid label name: cannot be empty');
  assert(labelName.length <= 50, 'Invalid label name: maximum length is 50 characters');
  assert(
    LABEL_NAME_PATTERN.test(labelName),
    `Invalid label name "${labelName}": use letters, numbers, spaces, "_" or "-"`,
  );
}

export function assertValidLabelColor(color: string): void {
  assert(
    HEX_COLOR_PATTERN.test(color),
    `Invalid label color "${color}": expected a 6-character hex code`,
  );
}
