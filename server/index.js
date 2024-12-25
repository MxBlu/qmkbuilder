const Express = require('express');
const BodyParser = require('body-parser');
const Crypto = require('crypto');
const Exec = require('child_process').exec;
const Fs = require('fs');

const co = require('co');

// Get environment variables.
const envTMP = process.env.TMP || '/tmp/qmk-';
const envPORT = process.env.PORT || 80;
const envQMK = process.env.QMK || null;
const envSTATIC = process.env.STATIC || null;
if (envQMK === null) {
  console.error('No QMK environment variable specified');
  process.exit(1);
}
if (envSTATIC === null) {
  console.error('No STATIC environment variable specified');
  process.exit(1);
}

// Create the express app.
const app = Express();
app.use(BodyParser.json());
app.use(BodyParser.urlencoded({ extended: true }));

// Allow cross-origin requests.
app.all('*', (req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'X-Requested-With');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	next();
});

// Serve static content.
app.use(Express.static(envSTATIC));

// Set up the /build route.
app.post('/build', (req, res) => {
	// Get the files.
	const configuration = req.body

	// Create a temporary directory.
	const key = Crypto.randomBytes(16).toString('hex');
	const tmpdir = envTMP + key;
	const configurationFileName = `/tmp/${key}.json`;

	// Keyboard name from configuration
	const kbname = configuration?.keyboard?.settings?.name;

	// Setup helper functions.
	const clean = () => {
		Exec('rm -rf ' + tmpdir);
		Exec('rm ' + configurationFileName);
	};

	const sendError = err => {
    console.error(err);
		res.json({ error: err });
		clean();
	};

	
	console.log(`Build request received for ${kbname}`);

	// Start.
	co(function*() {

		/*
			1. cd into master qmk dir
			2. git pull
			3. copy master qmk to temp qmk
			4. set QMK_HOME to tmp qmk
			5. save json to /tmp
			6. qmk import-kbfirmware /tmp/keyboard.json
		*/

		// Ensure QMK up to date
		yield new Promise((resolve, reject) => {
			Exec(`cd ${envQMK} && git pull`, (err, stdout, stderr) => {
				if (err) return reject('Failed to update QMK');
				console.log("Ensured QMK up to date");
				resolve();
			});
		});

		// Copy QMK to temp folder
		yield new Promise((resolve, reject) => {
			Exec(`rsync -a ${envQMK}/ ${tmpdir} --exclude keyboards`, (err, stdout, stderr) => {
				if (err) return reject(stderr);
				console.log(`Copied temp QMK dir: ${tmpdir}`);
				resolve();
			});
		});

		// Save config json to tmp
		yield new Promise((resolve, reject) => {
			Fs.writeFile(configurationFileName, JSON.stringify(configuration), err => {
				if (err) return reject('Failed to save configuration.');
				console.log(`Saved configuration: ${configurationFileName}`);
				resolve();
			});
		});

		// Convert configuration to QMK format
		yield new Promise((resolve, reject) => {
			Exec(`qmk import-kbfirmware ${configurationFileName}`, { env: { ...process.env, "QMK_HOME": tmpdir } }, (err, stdout, stderr) => {
				if (err) return reject(stderr);
				console.log(`Imported configuration: ${configurationFileName}`);
				resolve();
			});
		});

		// Compile firmware
		yield new Promise((resolve, reject) => {
			Exec(`qmk compile -kb ${kbname.toLowerCase()} -km default`, { env: { ...process.env, "QMK_HOME": tmpdir } }, (err, stdout, stderr) => {
				if (err) return reject(stderr);
				console.log(`Compiled firmware: ${tmpdir}/${kbname.toLowerCase()}_default.hex`);
				resolve();
			});
		});

		// Read the hex file.
		const hex = yield new Promise((resolve, reject) => {
			Fs.readFile(`${tmpdir}/${kbname.toLowerCase()}_default.hex`, 'utf8', (err, data) => {
				if (err) return reject('Failed to read hex file.');
				resolve(data);
			});
		});

		// Send the hex file.
		res.json({ hex: hex });

		// Clean up.
		clean();
	}).catch(e => sendError(e));
});

// Start listening.
app.listen(envPORT, () => console.log('Listening on port ' + envPORT + '...'));

// Exit on SIGINT and SIGTERM.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
function shutdown() {
  // TODO: This is not a clean shutdown.
  process.exit(0);
}
