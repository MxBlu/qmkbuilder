const React = require('react');

const CodeMirror = require('react-codemirror');
require('codemirror/mode/javascript/javascript');

const C = require('const');

class Quantum extends React.Component {

	render() {
		const state = this.props.state;
		const keyboard = state.keyboard;

		return <div className='pane-quantum'>
			Add custom configuration to the keyboard.json that gets generated.
			<br />
			
			<div style={{ height: '0.5rem' }}/>
			<button
				className='light'
				onClick={ () => { keyboard.settings.extraConfiguration = ''; state.update(); } }>
				Reset to default
			</button>
			<div style={{ height: '0.5rem' }}/>
			<div className='pane-quantum-editor'>
				<CodeMirror
					value={ keyboard.settings.extraConfiguration }
					onChange={ v => { keyboard.settings.extraConfiguration = v; state.update(); } }
					options={{
						mode: 'application/json',
						lineNumbers: false,
						indentUnit: 4,
						indentWithTabs: true
					}}/>
			</div>
		</div>;
	}

}

module.exports = Quantum;
