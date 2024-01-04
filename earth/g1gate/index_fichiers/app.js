import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
export const DU = 10.68;
export const MAX_NB_TX = 200;
let txLimit = MAX_NB_TX;
let minTime = null;

export const CESIUM_G1_NODES = [
	"https://g1.data.brussels.ovh",
	"https://g1.data.e-is.pro",
	"https://g1.data.cuates.net",
	"https://g1.data.madeirawonders.com",

	// "https://g1.data.pini.fr" // Could not resolve hostname
	// "https://g1.data.le-sou.org" // vide
	// "https://abyayala.g1labs.net" // /g1/movement returns "404 Not Found"
	// "https://g1.data.presles.fr", // CORS
	// "https://cesiumplus971.dns1.us", // CORS
	// "https://g1.data.mithril.re", // /g1/movement returns "403 Forbidden"
];

let chartColors = [
	'#FFC431',
	'#548AFF',
	'#FF826E',
	'#67B0C3',
	'#CFD8DC',
	'#5CD6B3'
];

export const Treemap = (
	// Copyright 2021-2023 Observable, Inc.
	// Released under the ISC license.
	// https://observablehq.com/@d3/treemap
	function Treemap(data, { // data is either tabular (array of objects) or hierarchy (nested objects)
		path, // as an alternative to id and parentId, returns an array identifier, imputing internal nodes
		id = Array.isArray(data) ? d => d.id : null, // if tabular data, given a d in data, returns a unique identifier (string)
	parentId = Array.isArray(data) ? d => d.parentId : null, // if tabular data, given a node d, returns its parent’s identifier
					 children, // if hierarchical data, given a d in data, returns its children
				  value, // given a node d, returns a quantitative value (for area encoding; null for count)
	sort = (a, b) => d3.descending(a.value, b.value), // how to sort nodes prior to layout
					 label, // given a leaf node d, returns the name to display on the rectangle
				  group, // given a leaf node d, returns a categorical value (for color encoding)
	title, // given a leaf node d, returns its hover text
	link, // given a leaf node d, its link (if any)
	linkTarget = "_blank", // the target attribute for links (if any)
	tile = d3.treemapBinary, // treemap strategy
	width = 640, // outer width, in pixels
	height = 400, // outer height, in pixels
	margin = 0, // shorthand for margins
	marginTop = margin, // top margin, in pixels
	marginRight = margin, // right margin, in pixels
	marginBottom = margin, // bottom margin, in pixels
	marginLeft = margin, // left margin, in pixels
	padding = 1, // shorthand for inner and outer padding
	paddingInner = padding, // to separate a node from its adjacent siblings
	paddingOuter = padding, // shorthand for top, right, bottom, and left padding
	paddingTop = paddingOuter, // to separate a node’s top edge from its children
	paddingRight = paddingOuter, // to separate a node’s right edge from its children
	paddingBottom = paddingOuter, // to separate a node’s bottom edge from its children
	paddingLeft = paddingOuter, // to separate a node’s left edge from its children
	round = true, // whether to round to exact pixels
	colors = d3.schemeTableau10, // array of colors
	zDomain, // array of values for the color scale
	fill = "#ccc", // fill for node rects (if no group color encoding)
	fillOpacity = group == null ? null : 0.6, // fill opacity for node rects
	stroke, // stroke for node rects
	strokeWidth, // stroke width for node rects
	strokeOpacity, // stroke opacity for node rects
	strokeLinejoin, // stroke line join for node rects
	} = {}) {

		// If id and parentId options are specified, or the path option, use d3.stratify
		// to convert tabular data to a hierarchy; otherwise we assume that the data is
		// specified as an object {children} with nested objects (a.k.a. the “flare.json”
		// format), and use d3.hierarchy.

		// We take special care of any node that has both a value and children, see
		// https://observablehq.com/@d3/treemap-parent-with-value.
		const stratify = data => (d3.stratify().path(path)(data)).each(node => {
			if (node.children?.length && node.data != null) {
				const child = new d3.Node(node.data);
				node.data = null;
				child.depth = node.depth + 1;
				child.height = 0;
				child.parent = node;
				child.id = node.id + "/";
				node.children.unshift(child);
			}
		});
		const root = path != null ? stratify(data)
		: id != null || parentId != null ? d3.stratify().id(id).parentId(parentId)(data)
		: d3.hierarchy(data, children);

		// Compute the values of internal nodes by aggregating from the leaves.
		value == null ? root.count() : root.sum(d => Math.max(0, d ? value(d) : null));

		// Prior to sorting, if a group channel is specified, construct an ordinal color scale.
		const leaves = root.leaves();
		const G = group == null ? null : leaves.map(d => group(d.data, d));
		if (zDomain === undefined) zDomain = G;
		zDomain = new d3.InternSet(zDomain);
		const color = group == null ? null : d3.scaleOrdinal(zDomain, colors);

		// Compute labels and titles.
		const L = label == null ? null : leaves.map(d => label(d.data, d));
		const T = title === undefined ? L : title == null ? null : leaves.map(d => title(d.data, d));

		// Sort the leaves (typically by descending value for a pleasing layout).
		if (sort != null) root.sort(sort);

		// Compute the treemap layout.
		d3.treemap()
		.tile(tile)
		.size([width - marginLeft - marginRight, height - marginTop - marginBottom])
		.paddingInner(paddingInner)
		.paddingTop(paddingTop)
		.paddingRight(paddingRight)
		.paddingBottom(paddingBottom)
		.paddingLeft(paddingLeft)
		.round(round)
		(root);

		const svg = d3.create("svg")
		.attr("viewBox", [-marginLeft, -marginTop, width, height])
		.attr("width", width)
		.attr("height", height)
		.attr("style", "max-width: 100%; height: auto; height: intrinsic;")
		.attr("font-family", "sans-serif")
		.attr("font-size", 10);

		const node = svg.selectAll("a")
		.data(leaves)
		.join("a")
		.attr("xlink:href", link == null ? null : (d, i) => link(d.data, d))
		.attr("target", link == null ? null : linkTarget)
		.attr("transform", d => `translate(${d.x0},${d.y0})`);

		node.append("rect")
		.attr("fill", color ? (d, i) => color(G[i]) : fill)
		.attr("fill-opacity", fillOpacity)
		.attr("stroke", stroke)
		.attr("stroke-width", strokeWidth)
		.attr("stroke-opacity", strokeOpacity)
		.attr("stroke-linejoin", strokeLinejoin)
		.attr("width", d => d.x1 - d.x0)
		.attr("height", d => d.y1 - d.y0);

		if (T) {
			node.append("title").text((d, i) => T[i]);
		}

		if (L) {
			// A unique identifier for clip paths (to avoid conflicts).
			const uid = `O-${Math.random().toString(16).slice(2)}`;

			node.append("clipPath")
			.attr("id", (d, i) => `${uid}-clip-${i}`)
			.append("rect")
			.attr("width", d => d.x1 - d.x0)
			.attr("height", d => d.y1 - d.y0);

			node.append("text")
			.attr("clip-path", (d, i) => `url(${new URL(`#${uid}-clip-${i}`, location)})`)
			.selectAll("tspan")
			.data((d, i) => `${L[i]}`.split(/\n/g))
			.join("tspan")
			.attr("x", 3)
			.attr("y", (d, i, D) => `${(i === D.length - 1) * 0.3 + 1.1 + i * 0.9}em`)
			.attr("fill-opacity", (d, i, D) => i === D.length - 1 ? 0.7 : null)
			.text(d => d);
		}

		return Object.assign(svg.node(), {scales: {color}});
	}
);

export const shuffle = (array) => {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
};

export const G12DU = (amount) => {

	return (Math.round(amount / DU * 100) / 100);
};


export const query__expenses = (walletPk, minTime, size = MAX_NB_TX) => {

	return {
		_source: ["amount", "recipient"]
		,sort: [
			{
				"medianTime": "desc"
			}
		]
		,size: size
		,query: {
			bool: {
				filter: [
					{
						range: {
							"medianTime": {
								gte: minTime
							}
						}
					}
					,{
						term: {
							"issuer": walletPk
						}
					}
				]
			}
		}
	};
};

export const fetchExpenses = async (pubkey, minTime, limit = MAX_NB_TX) => {

	shuffle(CESIUM_G1_NODES); // Mélanger la liste des noeuds

	for (let node of CESIUM_G1_NODES) {
		try {
			const url = `${node}/g1/movement/_search`;
			let queryBody = query__expenses(pubkey, minTime, limit);

			console.log('expenses queryBody : \n', JSON.stringify(queryBody));

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(queryBody)
			});

			const data = await response.json();

			console.log('node for the expenses of :\n', pubkey, '\n', node);
			console.log('expenses data :\n', data);

			let expensesByRecipient = {};
			let totalAmount = 0;

			for (const hit of data.hits.hits) {

				const tx = hit._source;

				if (!(tx.recipient in expensesByRecipient)) {

					expensesByRecipient[tx.recipient] = 0;
				}

				expensesByRecipient[tx.recipient] += tx.amount/100;

				totalAmount += tx.amount;
			}

			totalAmount = totalAmount/100;

			return {
				expensesTotalAmount: totalAmount
				,expensesByRecipient: expensesByRecipient
			};
		} catch (error) {
			console.error(`Failed to fetch data from ${node}: ${error}`);
			// Si une erreur se produit, passez simplement au noeud suivant
		}
	}

	throw new Error("Failed to fetch data from all nodes");
};


export const query__cesium_profile = (pubkey) => {

	return {
		_source: [
			"title",
			"issuer"
		]
		,query: {
			bool: {
				filter: [
					{term: {"_type": "profile"}}
				]
				,should: [
					{ term: { "issuer": pubkey } },
				]
				,minimum_should_match: 1
			}
		}
	};
};


export const query__cesium_profiles = (pubkeys, limit = 200) => {

	return {
		size: limit
		,_source: ["title"]
		,query: {
			bool: {
				filter: [
					{term: {"_type": "profile"}}
				]
				,should: [
					...pubkeys.map(pk => ({ term: { "issuer": pk } })),
				]
				,minimum_should_match: 1
			}
		}
	};
};

export const fetchCesiumProfile = async (pubkey) => {

	shuffle(CESIUM_G1_NODES); // Mélanger la liste des noeuds

	for (let node of CESIUM_G1_NODES) {

		try {
			const url = `${node}/user/profile/_search`;
			let queryBody = query__cesium_profile(pubkey);

			console.log('cesium_profile queryBody : \n', JSON.stringify(queryBody));

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(queryBody)
			});

			const data = await response.json();

			if (data.hits.hits[0] == undefined) {
				return null;
			}

			return  data.hits.hits[0]._source;

		} catch (error) {
			console.error(`Failed to fetch data from ${node}: ${error}`);
			// Si une erreur se produit, passez simplement au noeud suivant
		}
	}

	throw new Error("Failed to fetch data from all nodes");
};

export const fetchCesiumProfiles = async (pubkeys, limit) => {

	shuffle(CESIUM_G1_NODES); // Mélanger la liste des noeuds

	for (let node of CESIUM_G1_NODES) {

		try {
			const url = `${node}/user/profile/_search`;
			let queryBody = query__cesium_profiles(pubkeys, limit);

			console.log('cesium_profiles queryBody : \n', JSON.stringify(queryBody));

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(queryBody)
			});

			const data = await response.json();

			let profiles = [];

			for (const hit of data.hits.hits) {

				profiles[hit._id] = {
					title: hit._source.title
				};
			}

			return profiles;

		} catch (error) {
			console.error(`Failed to fetch data from ${node}: ${error}`);
			// Si une erreur se produit, passez simplement au noeud suivant
		}
	}

	throw new Error("Failed to fetch data from all nodes");
};

export const displayExpenses = (expensesByRecipient, expensesTotalAmount, recipientsCesiumProfiles, chartColors, currentPubkey, currentProfile) => {

	let screenElt = document.querySelector('#expenses');

	screenElt.innerHTML = '';

	let currentProfileTitleElt = document.createElement('h2');
	screenElt.append(currentProfileTitleElt);
	let title = null;
	if (currentProfile == undefined) {
		title = 'Dépenses du portefeuille <code>' + currentPubkey.substr(0, 8) + '</code>';
	} else {
		title = 'Dépenses de <q>' + currentProfile.title + '</q>';
	}
	currentProfileTitleElt.innerHTML = title;

	let svgContainer = document.createElement('article');
	screenElt.append(svgContainer);
	svgContainer.classList.add("svg-container");

	let chartData = [];

	// Formatting data
	for (const recipient in expensesByRecipient) {

		let recipientObj = {};

		recipientObj.pk = recipient;
		recipientObj.amount = expensesByRecipient[recipient];
		let numberOptions = { roundingMode: 'ceil', minimumFractionDigits: 0, maximumFractionDigits: 0 };
		recipientObj.displayedAmount = G12DU(recipientObj.amount).toLocaleString('fr-FR', numberOptions) + ' DU';

		if (recipientsCesiumProfiles[recipient] != undefined
			&&  recipientsCesiumProfiles[recipient].title != undefined
		) {
			recipientObj.title = recipientsCesiumProfiles[recipient].title;
		} else {
			recipientObj.title = recipient.substr(0, 8);
		}

		chartData.push(recipientObj);
	}

	let chart = Treemap(chartData, {
		path: d => d.title,
		value: d => d.amount,
		group: d => d.title,
		label: (d, n) => d.title,
		title: (d, n) => d.displayedAmount,
		link: (d, n) => '#' + d.pk + '',
		linkTarget: '_self',
		tile: d3.treemapSquarify,
		width: 1280,
		height: 720,
		padding: 0,
		colors: chartColors,
		fillOpacity: 1
	});

	svgContainer.append(chart);

	screenElt.scrollIntoView({behavior: 'smooth'}, true);
};


let formElt = document.querySelector('form#explore');

const treemapIt = async (pubkey, minTime, maxNbTx = MAX_NB_TX) => {

	let dotsPos = pubkey.indexOf(':');
	if (dotsPos != -1) {
		pubkey = pubkey.substr(0, dotsPos);
	}

	let { expensesTotalAmount, expensesByRecipient } = await fetchExpenses(pubkey, minTime, maxNbTx);

	let nbRecipients = Object.keys(expensesByRecipient).length;

	console.log("nb recipients :\n", nbRecipients);

	let recipientsList = Object.keys(expensesByRecipient);
	let recipientsCesiumProfiles = await fetchCesiumProfiles(recipientsList, maxNbTx);

	let currentProfile = await fetchCesiumProfile(pubkey);
	console.log('currentProfile :\n', currentProfile);

	displayExpenses(expensesByRecipient, expensesTotalAmount, recipientsCesiumProfiles, chartColors, pubkey, currentProfile);

	let svg = document.querySelector('#expenses svg');
	let links = svg.querySelectorAll("a");

	for (const link of links) {

		link.addEventListener('click', (linkEvent) => {

			// linkEvent.currentTarget.preventDefault();
			console.log('linkEvent.currentTarget :\n', linkEvent.currentTarget);
			let pubkey = linkEvent.currentTarget.getAttribute('href').substr(1);

			// treemapIt(pubkey, minDate);
		});
	}
};

const getPkInHash = () => {

	let hash = window.location.hash;
	hash = hash.substring(1);
	return hash;
};

window.addEventListener("popstate", (popEvent) => {

	let pk = getPkInHash();
	console.log('\n\n\npubkey :\n', pk);

	if (pk != '') {
		treemapIt(pk, minTime, txLimit);
	}
});

formElt.addEventListener('submit', (formEvent) => {

	formEvent.preventDefault();

	txLimit = formEvent.target.querySelector('input[name="txLimit"]').value;

	let minDateStr = formEvent.target.querySelector('input[name="minDate"]').value;
	let minDate = new Date(minDateStr);
	minTime = Math.floor(minDate.valueOf()/1000);
	console.log('minTime :\n', minTime);

	let pubkey = formEvent.target.querySelector('input[name="pubkey"]').value;

	window.location = '#';
	window.location = '#' + pubkey;
});

window.addEventListener('DOMContentLoaded', (loadEvent) => {

	let formElt = document.getElementById('explore');

	let minDateElt = formElt.querySelector('input[name="minDate"]');

	let now = Date();
	console.log('now : \n', now);

	let aMonthAgo = new Date(now);
	aMonthAgo.setMonth(aMonthAgo.getMonth() - 1);

	console.log('aMonthAgo : ', aMonthAgo);
	console.log('aMonthAgo.getMonth() :\n', aMonthAgo.getMonth());

	let dateStr = aMonthAgo.getFullYear() + '-' + (aMonthAgo.getMonth()+1).toString().padStart(2,0) + '-' + aMonthAgo.getDate().toString().padStart(2,0);

	console.log('dateStr : ', dateStr);

	minDateElt.value = dateStr;
});

