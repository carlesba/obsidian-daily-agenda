export interface XmlElement {
	name: string;
	attributes: Record<string, string>;
	children: XmlElement[];
	text: string;
}

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function parseXml(source: string): XmlElement {
	const root: XmlElement = { name: "", attributes: {}, children: [], text: "" };
	const open: XmlElement[] = [root];
	let index = 0;
	const current = () => open[open.length - 1];
	const skipPast = (terminator: string) => {
		const end = source.indexOf(terminator, index);
		index = end === -1 ? source.length : end + terminator.length;
	};
	while (index < source.length) {
		const next = source.indexOf("<", index);
		if (next === -1) {
			current().text += decodeEntities(source.slice(index));
			break;
		}
		if (next > index) current().text += decodeEntities(source.slice(index, next));
		index = next;
		if (source.startsWith("<![CDATA[", index)) {
			const end = source.indexOf("]]>", index);
			const stop = end === -1 ? source.length : end;
			current().text += source.slice(index + 9, stop);
			index = stop + 3;
		} else if (source.startsWith("<!--", index)) skipPast("-->");
		else if (source.startsWith("<?", index)) skipPast("?>");
		else if (source.startsWith("<!", index)) skipPast(">");
		else if (source.startsWith("</", index)) {
			skipPast(">");
			if (open.length > 1) open.pop();
		} else {
			const end = tagEnd(source, index);
			const tag = source.slice(index + 1, end);
			index = end + 1;
			const selfClosing = tag.endsWith("/");
			const element = elementFromTag(selfClosing ? tag.slice(0, -1) : tag);
			current().children.push(element);
			if (!selfClosing) open.push(element);
		}
	}
	return root.children[0] ?? root;
}

export function childElements(element: XmlElement | undefined, name: string): XmlElement[] {
	return element ? element.children.filter((child) => child.name === name) : [];
}

export function childElement(element: XmlElement | undefined, name: string): XmlElement | undefined {
	return element?.children.find((child) => child.name === name);
}

export function textOf(element: XmlElement | undefined): string {
	return element ? element.text.trim() : "";
}

function tagEnd(source: string, start: number): number {
	let quote: string | undefined;
	for (let index = start + 1; index < source.length; index++) {
		const character = source[index];
		if (quote) {
			if (character === quote) quote = undefined;
		} else if (character === '"' || character === "'") quote = character;
		else if (character === ">") return index;
	}
	return source.length;
}

function elementFromTag(tag: string): XmlElement {
	const nameMatch = /^\s*([^\s/>]+)/.exec(tag);
	const attributes: Record<string, string> = {};
	const attributePattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
	const rest = tag.slice(nameMatch ? nameMatch[0].length : 0);
	for (let match = attributePattern.exec(rest); match; match = attributePattern.exec(rest)) {
		attributes[localName(match[1])] = decodeEntities(match[3] ?? match[4] ?? "");
	}
	return { name: localName(nameMatch?.[1] ?? ""), attributes, children: [], text: "" };
}

function localName(name: string): string {
	const colon = name.indexOf(":");
	return colon === -1 ? name : name.slice(colon + 1);
}

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entity: string, body: string) => {
		if (body.startsWith("#x")) return String.fromCodePoint(parseInt(body.slice(2), 16));
		if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
		return NAMED_ENTITIES[body] ?? entity;
	});
}
