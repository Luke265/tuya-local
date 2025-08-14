import childProcess, { type ExecOptions } from 'child_process';

const host = process.env.PUBLISH_HOST;
const remoteDir = process.env.PUBLISH_DIR;
if (!host) {
  throw new Error('PUBLISH_HOST environment variable is not set');
}
if (!remoteDir) {
  throw new Error('PUBLISH_DIR environment variable is not set');
}

await exec(['cmd', '/c', 'nx run-many --target=build-release']);
await deploy('tuya-local');

async function deploy(packageName: string) {
  const dir = 'packages/' + packageName;
  const result = await exec([`npm pack --pack-destination ../../tmp`], {
    cwd: dir,
  });
  const name = result.split('\n').at(-2);

  console.log('Uploading...', `${dir}/${name}`);
  // Copy local to remote
  await scp([`tmp/${name}`, `${host}:${remoteDir}`]);
}

async function scp(args: string[]) {
  return new Promise((resolve, reject) => {
    const process = childProcess.spawn('scp', args, {
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    process.once('error', reject);
    process.once('close', resolve);
  });
}

async function exec(cmd: string[], options?: ExecOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    childProcess.exec(cmd.join(' '), options, (err, stdout) => {
      if (stdout) {
        process.stdout.write(stdout);
      }
      err ? reject(err) : resolve(stdout.toString());
    });
  });
}
