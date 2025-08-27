// ==UserScript==
// @name        NQ.G/NEOPETS: SDB Sorter and Est. NP/CC Value
// @namespace   NeoQuest.Guide
// @author      NeoQuest.Guide
// @version     20250316
// @match       *://www.neopets.com/safetydeposit.phtml*
// @connect     itemdb.com.br
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_xmlhttpRequest
// @description Logs each item on an SDB page and outputs table when on page 1, with data from itemdb.com.br
// ==/UserScript==

const allSDBItems = JSON.parse(GM_getValue("allSDBItems", "[]"));
const sdbItemsOnPage = document.querySelectorAll(".content form table")[2].querySelectorAll("tr[bgcolor^='#']");
const sdbCurrentPage = (parseInt(document.querySelector("select[name='offset']").value)+30)/30;
const sdbNumOfPages = document.querySelector("select[name='offset']").length;
const updateButton = document.createElement('button');
let itemDatabase = {};
const itemDBRateLimit = 1000*60*60; //ms, not an official limit, just being considerate

sdbItemsOnPage.forEach(item => {
  if(item.bgColor !== "#E4E4E4"){
	let id = parseInt(item.cells[5].children[0].name.split("\[")[1].split("\]")[0]);
	let index = allSDBItems.findIndex(x => x.id === id);
	// let name = item.cells[1].querySelector("b").childNodes[0].textContent;
	let qty = parseInt(item.cells[4].textContent);
	//in an attempt to ensure compatibility with sdb pricer from itemdb.br.com,
	if(item.cells[4].textContent.includes("NP")) qty = parseInt(item.cells[5].textContent);
	// let type = item.cells[3].querySelector("b").textContent;
	let o = {
	  "id": id,
	  "qty": qty,
	};
	if(index === -1){
	  allSDBItems.push(o);
	} else {
	  allSDBItems[allSDBItems.findIndex(x => x.id === id)] = o;
	}
  }
});
GM_setValue("allSDBItems", JSON.stringify(allSDBItems));
console.log("SDB Sorter Script: Logged items on current page");

if(sdbCurrentPage===1 && (document.URL==="https://www.neopets.com/safetydeposit.phtml" || document.URL==="https://www.neopets.com/safetydeposit.phtml?category=0&obj_name=&offset=0")){
  let hideNCItems = GM_getValue("hideNCItems", true);
  let hideTotalValues = GM_getValue("hideTotalValues", false);;
  let showMeTheTopNItems = GM_getValue("showMeTheTopNItems",30);
  let sortBy = GM_getValue("sortBy","qty");
  let filter = {
	name: "",
	minRarity: 0,
	value: 0,
	ccpPerItem: 0
  };
  const outputTable = document.createElement("div");
  applyStyles(outputTable,[
	["height", "250px"],
	["overflowY", "scroll"],
	["border", "1px solid #aaa"],
	["resize","vertical"]
  ]);
  const sdbScriptContainer = document.createElement("div");
  sdbScriptContainer.id = "sdbSorterScriptContainer";
  document.querySelector(".content").children[11].insertAdjacentElement('beforebegin', sdbScriptContainer);

  const itemDataDate = new Date(GM_getValue("itemDataDate", "-"));
  const itemDataDateStr = itemDataDate.toLocaleString([], {
	timeZone: "US/Pacific",
	year: 'numeric',
	month: 'short',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
  }) + " NST (" + timeAgo(itemDataDate) + ")";

  updateButton.addEventListener("click",()=>{
	if(itemDataDate.getTime()+itemDBRateLimit > new Date().getTime()){
	  updateButton.textContent = "Please do not request data too often; click again to request data.";
	  updateButton.addEventListener("click",()=>{
		updateButton.textContent = "Requesting data, please wait...";
		getAllItemData();
	  }, {once: true});
	}
	else{
	  updateButton.textContent = "Requesting data, please wait...";
	  getAllItemData();
	}
  }, {once: true});
  updateButton.innerHTML = `Update item data from itemdb.com.br <img src="https://itemdb.com.br/logo_icon.svg" width="16px" height="16px">`;
  updateButton.style.marginTop = "4px";

  const copyButton = document.createElement("button");
  copyButton.textContent = "Copy table to clipboard";
  copyButton.addEventListener("click", ()=> {
	GM_setClipboard(outputTable.innerText.trim());
	copyButton.textContent = "✅ Data copied ✅";
	setTimeout(function(){copyButton.textContent = "Copy table to clipboard";}, 5000);
  });

  const clearButton = document.createElement("button");
  clearButton.textContent = "Clear all data";
  clearButton.addEventListener("click", ()=> {
	if(confirm("Delete SDB data? You'll have to go through each page again!")){
	  GM_deleteValue("allSDBItems");
	  GM_deleteValue("itemDatabase");
	  GM_deleteValue("itemDataDate");
	  clearButton.textContent = "✅ Data deleted ✅";
	}
  });

  const inputShowTopN = document.createElement("input");
  inputShowTopN.style.width = "50px";
  inputShowTopN.type = "number";
  inputShowTopN.value = showMeTheTopNItems;
  inputShowTopN.addEventListener("keyup", e=>{
	GM_setValue("showMeTheTopNItems",e.target.value);
	showMeTheTopNItems = e.target.value;
	outputSDBInfo();
  });

  const inputFilterName = document.createElement("input");
  inputFilterName.style.width = "200px";
  inputFilterName.placeholder = "nerk";
  inputFilterName.type = "text";
  inputFilterName.addEventListener("keyup", e=>{
	filter.name = e.target.value;
	outputSDBInfo();
  });

  const inputFilterRarity = document.createElement("input");
  inputFilterRarity.style.width = "50px";
  inputFilterRarity.type = "number";
  inputFilterRarity.placeholder = "99";
  inputFilterRarity.addEventListener("keyup", e=>{
	filter.rarity = parseInt(e.target.value);
	outputSDBInfo();
  });

  const hideTotalsCheckbox = document.createElement("input");
  hideTotalsCheckbox.type = "checkbox";
  hideTotalsCheckbox.checked = hideTotalValues;
  hideTotalsCheckbox.addEventListener("change", e=>{
	GM_setValue("hideTotalValues",e.target.checked);
	hideTotalValues = e.target.checked;
	outputSDBInfo();
  });

  const hideNCItemsCheckbox = document.createElement("input");
  hideNCItemsCheckbox.type = "checkbox";
  hideNCItemsCheckbox.checked = hideNCItems;
  hideNCItemsCheckbox.addEventListener("change", e=>{
	GM_setValue("hideNCItems",e.target.checked);
	hideNCItems = e.target.checked;
	outputSDBInfo();
  });

  const sortBySelectOptions = [
	{v:"qty", d:"Quantity"},
	{v:"value", d:"Value"},
	{v:"stackValue", d:"Stack value"},
	{v:"CCP", d:"Charity points/item"},
	{v:"stackCCP", d:"Stack charity pts."},
	{v:"rarity", d:"Rarity"},
	{v:"itemcat", d:"Item category"},
	{v:"id", d:"Item id"},
  ];
  const sortBySelect = document.createElement("select");
  sortBySelectOptions.forEach(opt => {
	const option = document.createElement("option");
	option.value = opt.v;
	option.text = opt.d;
	sortBySelect.appendChild(option);
  });
  sortBySelect.value = sortBy;
  sortBySelect.addEventListener("change", e=>{
	GM_setValue("sortBy",e.target.value);
	sortBy = e.target.value;
	outputSDBInfo();
  });

  sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(document.createTextNode("SDB Sorter and Est. NP/CC Value Userscript: "));
  sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(document.createTextNode("Sort by: "));
  sdbScriptContainer.append(sortBySelect);
  // sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(document.createTextNode(", then show the top n items: "));
  sdbScriptContainer.append(inputShowTopN);
  sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(document.createTextNode("Hide total values: "));
  sdbScriptContainer.append(hideTotalsCheckbox);
  // sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(document.createTextNode(" | Hide NC Items: "));
  sdbScriptContainer.append(hideNCItemsCheckbox);
  sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(document.createTextNode("Filter items by name: "));
  sdbScriptContainer.append(inputFilterName);
  // sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(document.createTextNode(" by min. rarity: "));
  sdbScriptContainer.append(inputFilterRarity);
  sdbScriptContainer.append(document.createElement("br"));
  sdbScriptContainer.append(updateButton);
  sdbScriptContainer.append(document.createTextNode(" "));
  sdbScriptContainer.append(copyButton);
  sdbScriptContainer.append(document.createTextNode(" "));
  sdbScriptContainer.append(clearButton);

  const scriptInfo = document.createElement("div");
  const estMsPerPage = 3000;
  const estMinutes = Math.floor((estMsPerPage*sdbNumOfPages % (1000 * 60 * 60)) / (1000 * 60));
  const estSeconds = Math.floor((estMsPerPage*sdbNumOfPages % (1000 * 60)) / 1000);
  scriptInfo.innerHTML = `<p style="font-size:10px; font-style:italic;">Disclaimer: <a href="https://itemdb.com.br">https://itemdb.com.br/</a> by Magnetismo Times (a certified fansite) provides items values as a guide for users; be aware that values could be inaccurate.<br>Drag bottom right corner to resize table.<br>Estimated time to click through pages 1 to ${sdbNumOfPages}: ${estMinutes} min ${estSeconds} sec (assumes ${estMsPerPage/1000} seconds per page)<br>Item data last updated: ${itemDataDateStr}</p>`;
  sdbScriptContainer.append(scriptInfo);
  sdbScriptContainer.append(outputTable);

  sdbScriptContainer.append(document.createElement("hr"));
  outputSDBInfo();

  function outputSDBInfo(){
	const itemDatabase = JSON.parse(GM_getValue("itemDatabase", "{}"));
	if(Object.keys(itemDatabase).length === 0) {
	  outputTable.innerHTML = "";
	  outputTable.append(createHTMLTable([["You're missing the data from itemdb.com.br; first, you need to go through every page in your SDB (by clicking 'Next »') so every item is logged. Then return to page 1 and click the 'Update item data from itemdb.com.br' button above."]]));
	  return;
	}

	let shownItemsTable = [["Item","Rarity","Qty","NP Value","Stack NP Value","Charity pts","Stack charity pts","Item Type"]];
	let totalValue = 0;
	let totalQty = 0;
	let totalCCPoints = 0;

	allSDBItems.forEach(item => {
	  //at start, item = {id: <number>, qty: <number>}
	  item = Object.assign(item, itemLookupByItemId(parseInt(item.id)));

	  item.cc = ccValue(item.rarity);
	  if(item.name === "Sticky Snowball") item.cc = 1;

	  let stackValue;
	  if(isNaN(item.value)){
		stackValue = "-";
	  }
	  else {
		stackValue = item.qty*item.value;
		totalValue += stackValue;
	  }

	  totalCCPoints += item.qty*item.cc;
	  totalQty += item.qty;

	  item.prettyTable = [
		item.name,
		"(r"+item.rarity+")",
		item.qty,
		item.value,
		stackValue,
		item.cc,
		item.qty*item.cc,
		item.cat
	  ];
	});


	function itemLookupByItemId(id){
	  if(itemDatabase.hasOwnProperty(id)){
		return itemDatabase[id];
	  } else {
		return {};
	  }
	}

	let filteredItems = allSDBItems;
	if(hideNCItems) filteredItems = filteredItems.filter(item=>item.rarity<500);
	if(filter.name !== "") filteredItems = filteredItems.filter(item=>item.name.toLowerCase().includes(filter.name));
	if(!isNaN(filter.rarity)) filteredItems = filteredItems.filter(item=>item.rarity>=filter.rarity);

	let sortFunction;
	if(sortBy==="id") sortFunction = function(a,b){return a.id-b.id;};
	if(sortBy==="qty") sortFunction = function(a,b){return b.qty-a.qty;};
	if(sortBy==="value"){
	  sortFunction = function(a,b){
		const numA = !isNaN(a.value);
		const numB = !isNaN(b.value);
		if(numA && numB){
		  return b.value-a.value
		}
		if (numA) return -1;
		if (numB) return 1;
		if (!numA && !numB) {
		  return a.value.localeCompare(b.value);
		}
	  }
	}
	if(sortBy==="stackValue") sortFunction = function(a,b){return (b.qty*b.value)-(a.qty*a.value);};
	if(sortBy==="CCP") sortFunction = function(a,b){return b.cc-a.cc;};
	if(sortBy==="stackCCP") sortFunction = function(a,b){return (b.qty*b.cc)-(a.qty*a.cc);};
	if(sortBy==="rarity") sortFunction = function(a,b){return b.rarity-a.rarity;};
	if(sortBy==="itemcat") sortFunction = (function (a, b) {
	  if (a.cat < b.cat) {
		return -1;
	  }
	  if (a.cat > b.cat) {
		return 1;
	  }
	  return 0;
	});
	filteredItems.sort(sortFunction);
	let totalCCPTopItems = 0;
	let totalNPTopItems = 0;
	filteredItems.slice(0, showMeTheTopNItems).forEach(item => {
	  if(!isNaN(item.value)){
		totalNPTopItems += item.qty*item.value;
	  }
	  totalCCPTopItems += item.qty*item.cc;
	  shownItemsTable.push(item.prettyTable);
	});

	outputTable.innerHTML = "";
	if(Object.keys(itemDatabase).length < allSDBItems.length) {
	  outputTable.append(createHTMLTable([["⚠️ The script's database is missing information on one or more items in your SDB. Use the button to update data. ⚠️"]]));
	}

	const actualSDBQtys = document.querySelector(".content > table").textContent.replace(/,/g,"");

	const sdbInfoTable = createHTMLTable([
	  ["Total unique items (logged / actual / retrieved)",allSDBItems.length.toLocaleString("en-us") + " / " + parseInt(actualSDBQtys.match(/Items: (\d+)/)[1]).toLocaleString("en-us") + " / " + Object.keys(itemDatabase).length.toLocaleString("en-us")],
	  ["Total quantity of items (logged / actual)", totalQty.toLocaleString("en-us") + " / " + parseInt(actualSDBQtys.match(/Qty: (\d+)/)[1]).toLocaleString("en-us")],
	  ["Est. total NP value of entire SDB", (!hideTotalValues ? totalValue.toLocaleString("en-us") : "******")],
	  ["Total charity points of entire SDB", (!hideTotalValues ? totalCCPoints.toLocaleString("en-us") : "******")],
	  ["Est. total value of items below", (!hideTotalValues ? totalNPTopItems.toLocaleString("en-us") : "******")],
	  ["Total charity points of items below", (!hideTotalValues ? totalCCPTopItems.toLocaleString("en-us") : "******")],
	  ["Top " + showMeTheTopNItems + " items when sorted by "+sortBy]
	]);
	applyStyles(sdbInfoTable.querySelector("td:nth-of-type(1)"), [
	  ["width","30%"],
	]);
	outputTable.append(sdbInfoTable);
	outputTable.append(createHTMLTable(shownItemsTable));
  }

  function ccValue(r){
	if(r<80) return 1;
	if(r<90) return 2;
	if(r<98) return 6;
	if(r<101) return 4;
	if(r<102) return 1;
	if(r<180) return 8;
	if(r===180) return 0;
	if(r===200) return 0;
	else return 0;
  };
}

function createHTMLTable(arrOfRowData){
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  arrOfRowData.forEach((arrTextToPutInCells) => {createRow(arrTextToPutInCells)});
  table.appendChild(tbody);
  applyStyles(table, [
	["fontFamily","\"MuseoSansRounded700\", \'Arial\', sans-serif"],
	["borderCollapse", "collapse"],
	["margin", "5px auto"],
	["width","100%"]
  ]);
  return table;

  function createRow(arrTextToPutInCells){
	const row = document.createElement("tr");
	applyStyles(row,[
	  ["borderBottom", "1px dashed #aaa"]
	]);
	arrTextToPutInCells.forEach((cellContent) => {
	  const cell = document.createElement("td");
	  if(typeof cellContent === "number"){
		cellContent = cellContent.toLocaleString("en-us");
	  }
	  cell.textContent = cellContent;
	  applyStyles(cell,[
		["padding", "3px 10px"]
	  ]);
	  row.appendChild(cell);
	});
	tbody.appendChild(row);
  }
}

function applyStyles(element, styles){
  styles.forEach(rule => {element.style[rule[0]] = rule[1];});
}

function timeAgo(input) {
  const date = (input instanceof Date) ? input : new Date(input);
  const formatter = new Intl.RelativeTimeFormat('en');
  const ranges = {
	years: 3600 * 24 * 365,
	months: 3600 * 24 * 30,
	weeks: 3600 * 24 * 7,
	days: 3600 * 24,
	hours: 3600,
	minutes: 60,
	seconds: 1
  };
  const secondsElapsed = (date.getTime() - Date.now()) / 1000;
  for (let key in ranges) {
	if (ranges[key] < Math.abs(secondsElapsed)) {
	  const delta = secondsElapsed / ranges[key];
	  return formatter.format(Math.round(delta), key);
	}
  }
}

function getAllItemData(){
  const aItemIds = [];
  allSDBItems.map(oItem => aItemIds.push(parseInt(oItem.id)));
  aItemIds.sort((a,b)=>{return a-b});

  const aItemIdChunks = [];
  const chunkSize = 5000;
  for (let i=0; i<aItemIds.length; i+=chunkSize) {
	aItemIdChunks.push(aItemIds.slice(i, i + chunkSize));
  }
  let retrievedDataChunks = [];
  processDataChunks(0);

  function processDataChunks(chunkIndex){
	console.log("Requesting data chunk " + chunkIndex);
	updateButton.textContent = "Fetching data chunk "+(chunkIndex+1)+"/"+(aItemIdChunks.length)+", please wait...";
	makeExternalRequest({"item_id": aItemIdChunks[chunkIndex]}).then((oDataChunk) => {
	  console.log("Retrieved data chunk " + chunkIndex);
	  retrievedDataChunks.push(oDataChunk);
	  chunkIndex++;
	  if (chunkIndex < aItemIdChunks.length){
		processDataChunks(chunkIndex);
	  }
	  else {
		console.log("All data chunks retrieved");
		GM_setValue("itemDataDate", new Date().getTime());
		let combinedData = {};
		for (let i=0; i<aItemIds.length; i++) {
		  combinedData = Object.assign(combinedData, retrievedDataChunks[i]);
		}
		GM_setValue("itemDatabase", JSON.stringify(combinedData));
		updateButton.textContent = "✅ Success - reload the page or click here ✅";
		updateButton.addEventListener("click",()=>{
		  location.reload();
		}, {once: true});
	  }
	});
  }

  function makeExternalRequest(oReq){
	return new Promise((resolve, reject) => {
	  console.log("Getting data from itemdb.com.br", );
	  GM_xmlhttpRequest({
		responseType: "json",
		method: "POST",
		url: "https://itemdb.com.br/api/v1/items/many",
		data: JSON.stringify(oReq),
		headers: {
		  "Content-Type": "application/json"
		},
		onload: function(response) {
		  if (response.status === 200) {
			// console.log("Successfully retrieved data from itemdb.com.br");
			const wantedData = {};
			Object.entries(JSON.parse(response.responseText)).forEach(([keyId, oItem]) => {
			  wantedData[parseInt(keyId)] = {
				name: oItem.name,
				cat: oItem.category,
				value: oItem.price.value,
				rarity: oItem.rarity,
				isNC: oItem.isNC,
				isBD: oItem.isBD,
				isWearable: oItem.isWearable,
			  }
			});
			resolve(wantedData);
		  }
		  else{
			// console.log("Failed to get data chunk from itemdb.com.br");
			updateButton.textContent = "⚠️ Failed - try again later? ⚠️";
			reject();
		  }
		}
	  });
	});
  }
}

