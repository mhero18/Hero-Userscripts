// ==UserScript==
// @name         NQ.G/NEOPETS: Quest Prize EV
// @namespace    NeoQuest.Guide
// @author       NeoQuest.Guide
// @version      220251119
// @description  Display some calculations for quest prizes
// @match        https://www.neopets.com/questlog/
// @connect      itemdb.com.br
// @icon         none
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

let hideQLNotif_ifEquals1 = JSON.parse(GM_getValue("hideQLNotif_ifEquals1", false));
let currentWeeklyPrizes = JSON.parse(GM_getValue("currentWeeklyPrizes", "[]"));
let currentWeeklyPrizesData = JSON.parse(GM_getValue("currentWeeklyPrizesData", "[]"));
console.log("currentWeeklyPrizes", currentWeeklyPrizes);
console.log("currentWeeklyPrizesData", currentWeeklyPrizesData);
const loggedInUsername = document.querySelector(".nav-profile-dropdown-text a").textContent;
//check this because if a user checks side accounts for weekly prizes, it doesnt mess up the rerolled list

const scriptContainer = document.createElement("div");
const outputContainer = document.createElement("div");
const itemDataDate = new Date(GM_getValue("itemDataDate", "-"));
const itemDataDateStr = itemDataDate.toLocaleString([], {
  timeZone: "US/Pacific",
  year: 'numeric',
  month: 'long',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}) + " NST (" + timeAgo(itemDataDate) + ")";

let combineProgressBars = GM_getValue("combineProgressBars", true);
let linkifyQuests = GM_getValue("linkifyQuests", false);
const getDataBtn = document.createElement("button");
getDataBtn.classList.add("button-default__2020","button-yellow__2020");
getDataBtn.style.maxWidth = "604px";
getDataBtn.style.marginBottom = "6px";
scriptContainer.append(getDataBtn);

let rewardContainer;
let currentWeeklyPrizeNode;
let currentWeeklyPrize;
let outputHTML = "";
let alreadyRolledWeeklyPrizes;
let rerollCost;

waitForLogToLoad().then(()=>{
  const qlNotif = document.querySelector(".ql-notif");
  if(hideQLNotif_ifEquals1 && qlNotif.textContent === "1") qlNotif.remove();
  else if(!hideQLNotif_ifEquals1){
    qlNotif.addEventListener("click", (e)=>{
      e.stopPropagation();
      if(confirm("Do you want to hide this notification icon when it is (1)?")){
        GM_setValue("hideQLNotif_ifEquals1", true);
        if(qlNotif.textContent === "1") qlNotif.remove();
      }
    }, { once: true, capture: true });
  }


  rewardContainer = document.querySelector(".questlog-top");
  currentWeeklyPrizeNode = rewardContainer.querySelector("#QuestLogStreakName");
  currentWeeklyPrize = currentWeeklyPrizeNode.textContent;
  scriptContainer.style.font = "10px sans-serif";
  rewardContainer.insertAdjacentElement("afterend", scriptContainer);

  rerollCost = parseInt(document.querySelector("#QuestLogRerollCost").textContent.replace(/,/g,""));
  console.log("rerollCost", rerollCost);
  alreadyRolledWeeklyPrizes = JSON.parse(GM_getValue("alreadyRolledWeeklyPrizes_"+loggedInUsername, "[]"));
  console.log("alreadyRolledWeeklyPrizes_"+loggedInUsername, alreadyRolledWeeklyPrizes);
  if(rerollCost === 10000){
    alreadyRolledWeeklyPrizes = [];
  }
  if(rerollCost > 10000 && alreadyRolledWeeklyPrizes.length === 1){
    appendOutput(`It seems you've already rerolled prior to installing this script, so its output won't be fully accurate (as it can't retroactively check which items you've skipped).<br>`);
  }
  if(!alreadyRolledWeeklyPrizes.includes(currentWeeklyPrize)){
    alreadyRolledWeeklyPrizes.push(currentWeeklyPrize);
    GM_setValue("alreadyRolledWeeklyPrizes_"+loggedInUsername, JSON.stringify(alreadyRolledWeeklyPrizes));
  }


  scriptContainer.append(document.createElement("br"));
  const toggleCombineProgressBarsBtn = document.createElement("button");
  toggleCombineProgressBarsBtn.classList.add("button-default__2020","button-yellow__2020");
  toggleCombineProgressBarsBtn.style.maxWidth = "300px";
  scriptContainer.append(toggleCombineProgressBarsBtn);
  toggleCombineProgressBarsBtn.addEventListener("click", ()=>{
    combineProgressBars = combineProgressBars ? false : true;
    GM_setValue("combineProgressBars", combineProgressBars);
    toggleCombineProgressBars();
  });
  function toggleCombineProgressBars(){
    toggleCombineProgressBarsBtn.textContent = "Show both quest progress bars: " + (combineProgressBars ? "ON" : "OFF");
    //not using toggle is more reliable
    if(combineProgressBars){
      document.querySelector("#QuestLogStreakRewards").classList.remove("ql-hidden");
      // document.querySelector(".ql-bonus-label").remove();
      document.querySelector(".ql-bonus-label").style.display = "none";
    }
    else{
      document.querySelector("#QuestLogStreakRewards").classList.add("ql-hidden");
      document.querySelector(".ql-bonus-label").style.display = "flex";
    }
  }
  toggleCombineProgressBars();
  getDataBtn.style.display = "inline-block";
  toggleCombineProgressBarsBtn.style.display = "inline-block";
  getDataBtn.style.padding = "2px";
  toggleCombineProgressBarsBtn.style.padding = "2px";
  toggleCombineProgressBarsBtn.style.marginBottom = "6px";



  const toggleLinkifyQuestsBtn = document.createElement("button");
  toggleLinkifyQuestsBtn.classList.add("button-default__2020","button-yellow__2020");
  toggleLinkifyQuestsBtn.style.maxWidth = "300px";
  scriptContainer.append(toggleLinkifyQuestsBtn);
  toggleLinkifyQuestsBtn.addEventListener("click", ()=>{
    linkifyQuests = linkifyQuests ? false : true;
    GM_setValue("linkifyQuests", linkifyQuests);
    toggleLinkifyQuests();
  });
  function toggleLinkifyQuests(){
    toggleLinkifyQuestsBtn.textContent = "Add links to quests: " + (linkifyQuests ? "ON" : "OFF");
    if(linkifyQuests){
      console.log("Adding links to quests");
      document.querySelectorAll(".ql-quest-details").forEach(quest => {
        const questLinks = [];
        const questText = quest.querySelector(".ql-quest-description").textContent;
        if(!quest.querySelector(".ql-task-complete")){
          if(questText === "Purchase item(s) from any Neopian Shop"){
            questLinks.push(["https://www.neopets.com/generalstore.phtml", "Open General Store"]);
          }
          else if(questText === "Customise one of your Neopets"){
            questLinks.push(["https://www.neopets.com/customise/", "Customise"]);
          }
          else if(questText === "Feed any food item to one of your Neopets"){
            questLinks.push(["https://www.neopets.com/process_safetydeposit.phtml?offset=0&remove_one_object=48164&pin=", "Withdraw Space Faerie Cupcake from SDB"]);
            questLinks.push(["https://www.neopets.com/inventory.phtml", "Inventory"]);
          }
          else if(questText === "Groom one of your Neopets with any grooming item"){
            questLinks.push(["https://www.neopets.com/process_safetydeposit.phtml?offset=0&remove_one_object=15923&pin=", "Withdraw Brush from SDB"]);
            questLinks.push(["https://www.neopets.com/inventory.phtml", "Inventory"]);
          }
          else if(questText === "Play any Game or Classic Game in the Games Room"){
            questLinks.push(["https://www.neopets.com/games/h5game.phtml?game_id=1391", "HTML5 Fashion Fever"]);
            questLinks.push(["https://www.neopets.com/games/game.phtml?game_id=805&size=regular&quality=high&play=true", "Flash Fashion Fever"]);
          }
          else if(questText === "Spin the Wheel of Excitement in Faerieland"){
            questLinks.push(["https://www.neopets.com/faerieland/wheel.phtml", "Spin the Wheel"]);
          }
          else if(questText === "Spin the Wheel of Mediocrity in Tyrannia"){
            questLinks.push(["https://www.neopets.com/prehistoric/mediocrity.phtml", "Spin the Wheel"]);
          }
          else if(questText === "Spin the Wheel of Misfortune in the Haunted Woods"){
            questLinks.push(["https://www.neopets.com/halloween/wheel/index.phtml", "Spin the Wheel"]);
          }
          else if(questText === "Spin the Wheel of Knowledge in Brightvale"){
            questLinks.push(["https://www.neopets.com/medieval/knowledge.phtml", "Spin the Wheel"]);
          }
          //20251107 new quests
          else if(questText === "Reel in your line with one of your Neopets at Ye Olde Fishing Vortex in Maraqua"){
            questLinks.push(["https://www.neopets.com/water/fishing.phtml", "Go Fish"]);
          }
          else if(questText === "Try on any wearable item in the NC Mall"){
            questLinks.push(["https://ncmall.neopets.com/mall/search.phtml?type=browse&cat=43&page=1&limit=24", "Clothing in the NC mall"]);
          }
          else if(questText === "Fight in a 1-player or VS Battledome match"){
            questLinks.push(["https://www.neopets.com/dome/fight.phtml", "Battledome"]);
          }
          else if(questText === "Read a book to one of your Neopets"){
            questLinks.push(["https://www.neopets.com/safetydeposit.phtml?obj_name=&category=6", "Books in SDB"]);
            questLinks.push(["https://www.neopets.com/inventory.phtml", "Inventory"]);
          }
          else if(questText === "Play with any toy item with one of your Neopets"){
            questLinks.push(["https://www.neopets.com/safetydeposit.phtml?obj_name=&category=5", "Toys in SDB"]);
            questLinks.push(["https://www.neopets.com/inventory.phtml", "Inventory"]);
          }
          //20251119 new quests
          else if(questText === "Take a trip to the NC Mall!"){
            questLinks.push(["https://ncmall.neopets.com/mall/shop.phtml", "NC Mall"]);
          }
          else if(questText === "Visit the NC Mall and check out the Popular shop!"){
            questLinks.push(["https://ncmall.neopets.com/mall/search.phtml?type=popular_items", "Popular Items in the NC mall"]);
          }
          // else if(questText === ""){
          // questLinks.push(["", ""]);
          // }
          if(questLinks.length > 0){
            questLinks.forEach(link => {
              const span = document.createElement("span");
              span.textContent = " - ";
              quest.querySelector(".ql-quest-description").append(span);
              const a = document.createElement("a");
              a.href = link[0];
              a.textContent = link[1] ?? "Link to Quest";
              quest.querySelector(".ql-quest-description").append(a);
            });
          }
        }
      });
    }
  }
  toggleLinkifyQuests();
  toggleLinkifyQuestsBtn.style.display = "inline-block";
  toggleLinkifyQuestsBtn.style.padding = "2px";
  toggleLinkifyQuestsBtn.style.marginBottom = "6px";
  toggleLinkifyQuestsBtn.style.marginLeft = "4px";



  getDataBtn.innerHTML = `Fetch prize data from itemdb.com.br <img src="https://itemdb.com.br/logo_icon.svg" width="16px" height="16px">`;
  getDataBtn.addEventListener("click", () => {
    getDataBtn.textContent = "Fetching item list...";
    fetchWeeklyPrizeList().then(data=>{
      currentWeeklyPrizes = [];
      data.forEach(oItem => currentWeeklyPrizes.push(oItem.name));
      GM_setValue("currentWeeklyPrizes", JSON.stringify(currentWeeklyPrizes));
      currentWeeklyPrizes.push(currentWeeklyPrize);
      getDataBtn.textContent = "Fetching item data...";
      fetchItemData(currentWeeklyPrizes).then((combinedData)=>{
        GM_setValue("currentWeeklyPrizesData", JSON.stringify(combinedData));
        currentWeeklyPrizesData = combinedData;
        getDataBtn.textContent = "Data retreived ✅ Click to reload the page";
        updateEV();
        getDataBtn.addEventListener("click", ()=>{
          location.reload();
        }, {once: true});
      });
    });
  }, {once: true});


  scriptContainer.append(outputContainer);
  updateEV();


  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "characterData" || mutation.type === "childList") {
        currentWeeklyPrize = currentWeeklyPrizeNode.textContent;
        rerollCost = parseInt(document.querySelector("#QuestLogRerollCost").textContent.replace(/,/g,""));
        console.log("Weekly prize changed to:", currentWeeklyPrize);
        alreadyRolledWeeklyPrizes.push(currentWeeklyPrize);
        GM_setValue("alreadyRolledWeeklyPrizes_"+loggedInUsername, JSON.stringify(alreadyRolledWeeklyPrizes));
        console.log("alreadyRolledWeeklyPrizes_"+loggedInUsername, alreadyRolledWeeklyPrizes);
        // getDataBtn.textContent = "Your prize has changed at least once. Click to reload the page.";
        // getDataBtn.addEventListener("click", () => {
        // location.reload();
        // }, {once: true});
        updateEV();
      }
    }
  });

  observer.observe(currentWeeklyPrizeNode, { characterData: true, childList: true, subtree: true });

});



function updateEV(){
  outputContainer.innerHTML = "";
  outputHTML = "";
  appendOutput(`<span style="font-size:8px; font-style:italic;">Disclaimer: <a href="https://itemdb.com.br/">https://itemdb.com.br</a> by Magnetismo Times (a certified fansite) provides items values as a guide for users; be aware that guide values may not reflect current market values.<br>Market values will likely be far lower than guide values for some time after prizes change.<br>You can check current prizes at <a href="https://itemdb.com.br/lists/official/weekly-quest-prize">https://itemdb.com.br/lists/official/weekly-quest-prize</a><br>Item data last retreived: ${itemDataDateStr}${(new Date().getTime() - itemDataDate.getTime() >= 1000*60*60*48) ? "; consider fetching data again to keep prizes and values up-to-date, especially if the pool has recently changed." : ""}</span><br>`);

  if(!currentWeeklyPrizes.includes(currentWeeklyPrize)){
    appendOutput(`Your current prize is not recognized as part of the current prize pool. It could be an item from the previous pool or you may not have up-to-date prize data.<br>Use the button above to get the current data, if it is up-to-date.<br>If your prize is still unrecognized and you believe it's part of the new pool, please wait for the list to include the new item(s) (it should be very soon).<br>`);
  }
  //do this because if we have an old item on main, and we check a side, we should remove the old item from currentWeeklyPrizesData, so the side doesnt account for the extra item
  //because its against the rules to complete quests on a side, we only ever need to check for the one possible old item from the main
  const nonMatchingItem = Object.values(currentWeeklyPrizesData).find(o => !currentWeeklyPrizes.includes(o.name));
  console.log("Item in currentWeeklyPrizesData but not in currentWeeklyPrizes (i.e., old item on main)", nonMatchingItem);
  if(nonMatchingItem && currentWeeklyPrize !== nonMatchingItem.name){
    for (let key in currentWeeklyPrizesData) {
      if (currentWeeklyPrizesData[key].name === nonMatchingItem.name) {
        delete currentWeeklyPrizesData[key];
        console.log("Deleted", nonMatchingItem.name);
      }
    }
  }

  possibleWeeklyPrizesData = Object.fromEntries(
    Object.entries(currentWeeklyPrizesData)
    .filter(([key, value]) => !alreadyRolledWeeklyPrizes.includes(value.name))
  );
  const totalValue = Object.values(possibleWeeklyPrizesData).reduce((sum, item) => sum + (item.value || 0), 0);
  const totalItems = Object.keys(possibleWeeklyPrizesData).length;
  const expectedRerollValue = parseFloat((totalValue/totalItems).toFixed(0));

  if(!Object.values(currentWeeklyPrizesData).find(o=>o.name===currentWeeklyPrize)) return;
  if(!currentWeeklyPrizes.includes(currentWeeklyPrize)){
    appendOutput("The script will compare your prize to the current known pool, even if it is part of the previous pool.");
  }
  const currentPrizeValue = Object.values(currentWeeklyPrizesData).find(o=>o.name===currentWeeklyPrize).value ?? 0;
  const percentageOfExpectedValue = currentPrizeValue/(expectedRerollValue-rerollCost);
  let shouldReroll = percentageOfExpectedValue < 1 ? "Yes" : "No";
  let currentPrize_displayValue = currentPrizeValue;
  if(currentPrizeValue === 0){
    currentPrize_displayValue = "[unknown]";
    shouldReroll = "Probably not. It's likely that before it was in the prize pool, it was very rare."
  }


  appendOutput("There are " + emph(totalItems) + " weekly prizes you haven't rolled yet, worth a total of " + emph(totalValue.toLocaleString("en-us")+" NP"));
  appendOutput("The expected value of a rerolled prize minus the current reroll cost is " + emph((expectedRerollValue - rerollCost).toLocaleString("en-us")+" NP"));

  if ((expectedRerollValue - rerollCost) < 0) {
    appendOutput(`Your current prize, <a href="https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_exact&sort_by=newest&search_string=${currentWeeklyPrize.replace(/ /g,"+")}" target="_blank">${emph(currentWeeklyPrize)}</a>, is worth ${emph(currentPrize_displayValue.toLocaleString("en-us")+" NP")}.`);
    appendOutput("Your current prize, "+emph(currentWeeklyPrize)+", is worth "+emph(currentPrize_displayValue.toLocaleString("en-us")+" NP"));
    appendOutput("Should you consider rerolling? No, EV is negative.");
  }
  else {
    if(currentPrizeValue === 0){
      appendOutput(`Your current prize, <a href="https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_exact&sort_by=newest&search_string=${currentWeeklyPrize.replace(/ /g,"+")}" target="_blank">${emph(currentWeeklyPrize)}</a>, has an ${emph("unknown value")}`);
    }
    else{
      appendOutput(`Your current prize, <a href="https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_exact&sort_by=newest&search_string=${currentWeeklyPrize.replace(/ /g,"+")}" target="_blank">${emph(currentWeeklyPrize)}</a>, is worth ${emph(currentPrize_displayValue.toLocaleString("en-us")+" NP")}, about ${emph((percentageOfExpectedValue * 100).toFixed(0)+"%")} of the expected value.`);
      // appendOutput("Your current prize, "+emph(currentWeeklyPrize)+", is worth "+emph(currentPrize_displayValue.toLocaleString("en-us")+" NP") + ", about "+emph((percentageOfExpectedValue * 100).toFixed(0)+"%")+" of the expected value.");
    }

    if (percentageOfExpectedValue < 1.2 && percentageOfExpectedValue > 0.8) {
      appendOutput("The above value is close to 100%, so a rerolled prize is unlikely to be much better.");
    } else {
      appendOutput("Should you consider rerolling (is the above value much less than 100%)? " + emph(shouldReroll));
    }

    if (true) { //percentageOfExpectedValue < 1
      //just always show it
      let timesRerolled = alreadyRolledWeeklyPrizes.length-1;
      // let cost = 10000;
      // while (cost < rerollCost) {
      // cost = Math.min(cost * 2, 1000000);
      // timesRerolled++;
      // }
      // let strAtLeast = rerollCost === 1000000 ? " at least" : "";
      //logging rerolled items is now reliable enough that we dont need to do the above
      let sunkCost = [...Array(timesRerolled)].reduce((total, _, i) => total + Math.min(10000 * Math.pow(2, i), 1000000), 0);

      if (timesRerolled > 0) {
        appendOutput("But I've already rerolled " + emph(timesRerolled) + " time"+(timesRerolled === 1 ? "" : "s")+" and spent " + emph(sunkCost.toLocaleString("en-us") + " NP")+"!");
        appendOutput(`That's a <a href="https://en.wikipedia.org/wiki/Sunk_cost" target="_blank">${emph("sunk cost")}</a>! It should be ignored; the script does not use it to make calculations.`);
      }
    }
  }

  let values = Object.values(possibleWeeklyPrizesData);
  let mostValuable = values.reduce((max, item) => (item.value > max.value ? item : max), values[0]);
  let leastValuable = values
  .filter(item => typeof item.value === "number" && !isNaN(item.value))
  .reduce((min, item) => (item.value < min.value ? item : min), values[0]);
  console.log(mostValuable, leastValuable);
  leastValuable.displayValue = leastValuable.value;
  if(leastValuable.value === null) leastValuable.displayValue = "[unknown]";
  appendOutput("The "+emph("most")+" valuable prize you haven't rolled yet is " + emph(mostValuable.name) + ", worth " + emph(mostValuable.value.toLocaleString("en-us")+" NP"));
  appendOutput("The "+emph("least")+" valuable prize you haven't rolled yet is " + emph(leastValuable.name) + ", worth " + emph(leastValuable.displayValue.toLocaleString("en-us")+" NP"));

  const betterPrizes = Object.values(possibleWeeklyPrizesData).filter(item => item.value > currentPrizeValue);
  console.log(betterPrizes);
  appendOutput("There are "+emph(betterPrizes.length)+" prizes with a value higher than your current prize. There is a  "+emph((betterPrizes.length/totalItems*100).toFixed(0)+"%") +" chance that your next rerolled prize will be more valuable.");

  outputContainer.innerHTML = outputHTML;
}

function emph(text){
  return `<span style="font-weight: bold">${text}</span>`;
}

function appendOutput(text) {
  outputHTML += text + "<br>";
}

function fetchItemData(items){
  const aItemIds = items;
  console.log("Fetching data for "+aItemIds.length+" items");

  let arrayOfWhat = "item_id";
  if(isNaN(aItemIds[0])) arrayOfWhat = "name";
  console.log("arrayOfWhat", arrayOfWhat);

  const aItemIdChunks = [];
  const chunkSize = 5000;
  for (let i=0; i<aItemIds.length; i+=chunkSize) {
    aItemIdChunks.push(aItemIds.slice(i, i + chunkSize));
  }
  // console.log(aItemIdChunks);
  let retrievedDataChunks = [];
  return processDataChunks(0);

  function processDataChunks(chunkIndex) {
    if (chunkIndex >= aItemIdChunks.length) {
      console.log("All data chunks retrieved");
      GM_setValue("itemDataDate", new Date().getTime());
      let combinedData = {};
      retrievedDataChunks.forEach(chunk => {
        combinedData = Object.assign(combinedData, chunk);
      });
      console.log("Data updated successfully");
      return Promise.resolve(combinedData);
    }

    console.log("Requesting data chunk " + chunkIndex);
    return makeExternalRequest({ [arrayOfWhat]: aItemIdChunks[chunkIndex] })
      .then((oDataChunk) => {
      console.log("Retrieved data chunk " + chunkIndex);
      retrievedDataChunks.push(oDataChunk);
      return processDataChunks(chunkIndex + 1);
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
            console.log("Successfully retrieved data from itemdb.com.br");
            console.log(response.responseText);
            const wantedData = {};
            let tempKeyCounter = -1;
            Object.entries(JSON.parse(response.responseText)).forEach(([keyId, oItem]) => {
              let key = isNaN(parseInt(keyId)) ? oItem.item_id : parseInt(keyId);
              if(key === null){
                key = tempKeyCounter--;
              }
              wantedData[key] = {
                name: oItem.name,
                // cat: oItem.category,
                value: oItem.price.value,
                // rarity: oItem.rarity,
                // isNC: oItem.isNC,
                // isBD: oItem.isBD,
                // isWearable: oItem.isWearable,
              }
            });
            resolve(wantedData);
          }
          else{
            console.log("Failed to get data chunk from itemdb.com.br");
            reject();
          }
        }
      });
    });
  }
}
function fetchWeeklyPrizeList() {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      responseType: "json",
      url: "https://itemdb.com.br/api/v1/lists/official/weekly-quest-prize/itemdata",
      onload: function(response) {
        if (response.status === 200) {
          // var lines = response.responseText.split('\n');
          // var cleanedLines = lines.map(line => line.trim()).filter(line => line.length > 0);
          // GM_setValue("weeklyPrizeList", JSON.stringify(cleanedLines));
          console.log("Successfully retrieved data from itemdb.com.br");
          // console.log(response.responseText);
          const wantedData = [];
          JSON.parse(response.responseText).forEach(oItem => {
            wantedData.push({
              name: oItem.name,
              // cat: oItem.category,
              // value: oItem.price.value,
              // rarity: oItem.rarity,
              // isNC: oItem.isNC,
              // isBD: oItem.isBD,
              // isWearable: oItem.isWearable,
            });
          });
          resolve(wantedData);
        } else {
          console.error("Error: Couldn't fetch data. Status Code: " + response.status);
          getDataBtn.textContent = "Couldn't fetch data. Error "+ response.status +". Click to reload.";
          if(response.status === 429){
            outputContainer.innerHTML = "A 429 error indicates that itemdb is limiting your requests. Try again another time. You likely have the SDB Sorter script installed and have used it to request a lot of data.";
          }
          else {
            outputContainer.innerHTML = "Error may be temporary. Reload and try again, or try again another time.";
          }
          getDataBtn.addEventListener("click", () => {
            location.reload();
          }, {once: true});
          reject();
        }
      },
      onerror: function(error) {
        console.error("Error: " + error);
      }
    });
  });
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


function waitForLogToLoad(timeout = 300000) {
  const selector = ".ql-label";
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) return resolve();
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject("timed out");
    }, timeout);
  });
}
