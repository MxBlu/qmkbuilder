const React = require('react');

const Utils = require('utils');

const Request = require('superagent');

const C = require('const');

class Compile extends React.Component {

	constructor(props) {
		super(props);

		// Bind functions.
		this.downloadHex = this.downloadHex.bind(this);
	}

	downloadHex() {
		const state = this.props.state;
		const keyboard = state.keyboard;

		// Disable buttons.
		state.ui.set('compile-working', true);

		// Get a friendly name for the keyboard.
		const friendly = keyboard.settings.name ? Utils.generateFriendly(keyboard.settings.name) : 'layout';

		// Serialize the keyboard.
		const serialized = keyboard.serialize();

		// Create the configuration.
		const config = JSON.stringify({
			version: C.VERSION,
			keyboard: serialized
		});

		// Send the request.
		Request
			.post("/build")
			.set('Content-Type', 'application/json')
			.send(config)
			.end((err, res) => {
				res = JSON.parse(res.text);

				if (err) {
					console.error(err);
					state.error('Unable to connect to API server.');
					state.ui.set('compile-working', false);
					return;
				}

				// Check if there was an error.
				if (res.error) {
					console.error(res.error);
					state.error('Server error:\n' + res.error);
					state.ui.set('compile-working', false);
					return;
				}

				// Generate a friendly name.
				const friendly = keyboard.settings.name ? Utils.generateFriendly(keyboard.settings.name) : 'layout';

				// Download the hex file.
				const blob = new Blob([res.hex], { type: 'application/octet-stream' });
				saveAs(blob, friendly + '.hex');

				// Re-enable buttons.
				state.ui.set('compile-working', false);
			});
	}

	render() {
		const state = this.props.state;
		const keyboard = state.keyboard;

		return <div className='pane-compile'>
			Download the .hex file to flash to your keyboard.
			<div style={{ height: '0.5rem' }}/>
			<button
				disabled={ !keyboard.valid || state.ui.get('compile-working', false) }
				onClick={ this.downloadHex }>
				Download .hex
			</button>
		</div>;
	}

}

module.exports = Compile;
