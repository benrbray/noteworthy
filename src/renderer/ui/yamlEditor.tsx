import yaml from "yaml";
import { For } from "solid-js";

interface IYamlEditorProps {
	yamlMeta:{ [key:string] : any };
}

export const YamlEditor = (props:IYamlEditorProps) => {
	return (<dl>
		<For each={Object.keys(props.yamlMeta)}>
		{(key:string)=>(<>
			<dt>{key}</dt>
			<dd>{yaml.stringify(props.yamlMeta[key])}</dd>
		</>)}
		</For>
	</dl>);
}