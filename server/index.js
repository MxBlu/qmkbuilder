const Express = require('express');
const BodyParser = require('body-parser');
const Crypto = require('crypto');
const Exec = require('child_process').exec;
const Fs = require('fs');

const co = require('co');

function mergeObjects(source, destination) {
    Object.keys(source).forEach(function(key_default) {
        if (typeof destination[key_default] == "undefined") {
            destination[key_default] = source[key_default];
        } else if (isObject(source[key_default]) && isObject(destination[key_default])) {
            mergeObjects(source[key_default], destination[key_default]);
        }
    });

    function isObject(object) {
        return Object.prototype.toString.call(object) === '[object Object]';
    }

    return destination;
}

// Get environment variables.
const envTMP = process.env.TMP || '/tmp/qmk-';
const envPORT = process.env.PORT || 80;
const envQMK = process.env.QMK || null;
const envEMPTY_REPO = process.env.EMPTY_REPO || null;
const envSTATIC = process.env.STATIC || null;
if (envQMK === null) {
  console.error('No QMK environment variable specified');
  process.exit(1);
}
if (envEMPTY_REPO === null) {
	console.error('No empty repo dir set');
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
	// Extra configuration to merge in
	const extraConfiguration = configuration?.keyboard?.settings?.extraConfiguration ?? '';

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
			console.log(`Copying QMK to temp dir: ${tmpdir}`);
			Exec(`rsync -a ${envQMK}/ ${tmpdir} --exclude keyboards --exclude .git --exclude lib/chibios --exclude lib/chibios-contrib --exclude lib/lvgl --exclude lib/ugfx && rsync -a ${envEMPTY_REPO}/ ${tmpdir}`, (err, stdout, stderr) => {
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

		// Add in extra configuration if present
		if (extraConfiguration.trim().length > 0) {
			// Parse extra configuration
			const extraConfigJson = yield new Promise((resolve, reject) => {
				try {
					const extraConfigJson = JSON.parse(extraConfiguration);
					if (extraConfigJson == null) {
						return reject("Extra configuration is not valid JSON");
					}
					resolve(extraConfigJson);
				} catch (e) {
					return reject("Extra configuration is not valid JSON");
				}
			});

			// Get generated keyboard.json
			const keyboardJson = yield new Promise((resolve, reject) => {
				Fs.readFile(`${tmpdir}/keyboards/${kbname.toLowerCase()}/keyboard.json`, 'utf8', (err, data) => {
					if (err) return reject('Failed to read keyboard.json file.');
					resolve(JSON.parse(data));
				});
			});

			// Merge the generated keyboard.json and the extra configuration
			mergeObjects(extraConfigJson, keyboardJson);

			// Save new keyboard.json
			yield new Promise((resolve, reject) => {
				Fs.writeFile(`${tmpdir}/keyboards/${kbname.toLowerCase()}/keyboard.json`, JSON.stringify(keyboardJson), err => {
					if (err) return reject('Failed to save updated keyboard.json.');
					console.log(`Saved updated keyboard.json: ${tmpdir}/keyboards/${kbname.toLowerCase()}/keyboard.json`);
					resolve();
				});
			});
		}
			
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
