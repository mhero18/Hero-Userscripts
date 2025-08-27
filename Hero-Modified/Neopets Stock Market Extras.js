// ==UserScript==
// @name        Neopets : Stock Market Extras
// @namespace   https://www.reddit.com/user/jkingaround
// @description Format your stock portfolio so it's sortable, highlight any stocks above a certain number, adds two buttons to fill in or clear a specific stock to sell it all more conveniently, sortable list pages and hides anything under 15np (with optionally showing on click). Highlights your minimum buy price, changes link from profile to directly buy page and fills the 1000 in default. Removed images on port / list pages, swapped the arrow for something simpler
// @version	1.1
// @include     *neopets.com/stockmarket.phtml*
// @require	http://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js
// @require	https://raw.githubusercontent.com/christianbach/tablesorter/master/jquery.tablesorter.min.js
// ==/UserScript==

// enter the price you wish to highlight at
var minValue = 60;
var buyMin = 15;

this.$ = this.jQuery = jQuery.noConflict(true);
$.tablesorter.addParser({ 
	id: 'thousands',
    is: function(s) { 
        return false; 
    }, 
    format: function(s) {
        return s.replace(/,/g,'');
    }, 
    type: 'numeric'
});

var page = document.URL;

$('a:contains("Find Stocks"):last').before('<a href="'+$('a:contains("Find Stocks"):last').attr('href')+'&full=true">Full List</a> | ').attr('href',$('a:contains("Find Stocks"):last').attr('href')+"&bargain=true").find('b').text('Bargain Stocks');

if(page.indexOf("type=buy") !== -1){
	$("input[name=amount_shares]").val('1000');
}

if(page.indexOf("stockmarket.phtml?type=list&") !== -1){
	// we're on the list page

	var css = "table.tablesorter thead tr th, table.tablesorter tfoot tr th { background-color: #e6EEEE; border: 1px solid #FFF; font-size: 8pt; padding: 4px; } table.tablesorter thead tr .header { background-image: url('https://raw.githubusercontent.com/christianbach/tablesorter/master/themes/blue/bg.gif'); background-repeat: no-repeat; background-position: center right; cursor: pointer; padding-right: 20px; } table.tablesorter tbody td { padding: 4px; border: 0px; vertical-align: top; } table.tablesorter tbody tr.odd td { background-color:#F0F0F6; } table.tablesorter thead tr .headerSortUp { background-image: url('https://raw.githubusercontent.com/christianbach/tablesorter/master/themes/blue/asc.gif'); } table.tablesorter thead tr .headerSortDown { background-image: url('https://raw.githubusercontent.com/christianbach/tablesorter/master/themes/blue/desc.gif'); } table.tablesorter thead tr .headerSortDown, table.tablesorter thead tr .headerSortUp { background-color: #8dbdd8; }";

	$('<style type="text/css"></style>').html(css).appendTo("head");

	$list = $("table:contains('Company'):last");

	$('td.content > div:eq(1)').attr('style','');
	
	$list.addClass('list tablesorter').css({"margin-top":"10px","border":"0px"});

	$list.find('td').css({"border":"0px","padding":"4px 8px"});
		
	var i = 0;
	
	$('.list tr').each(function(){
		var price = $(this).find('td:eq(5) b').text();
		var ticker = $(this).find('td:eq(1) b').text();
		$(this).find('td:eq(1) a').attr('href','http://www.neopets.com/stockmarket.phtml?type=buy&ticker='+ticker);
		$(this).find('td:eq(0)').remove();
		console.log(price);
		if(price <= buyMin && price >= 15){
			$(this).find('td').each(function(){
				$(this).css("background-color","#bdc3c7"); // change the hex highlight color if you want.
			});
		}else if(price > buyMin){
			$(this).find('td').each(function(){
				$(this).css("background-color","#FFF");
			});
		}else{}
		
		if(price < 15){
			$(this).find('td').addClass('below15').css("background-color","#FFF").hide();
// 			$(this).css('opacity','.3');
// 			$(this).css('pointer-events','none');
		}
	});

	$(".list:first").before("<div style='text-align:center'><a href='#' class='showStocks'>Show Stocks under 15np/share</a></div>")
	
	$('.showStocks').on('click',function(e){
		e.preventDefault();
		if($(this).text().indexOf('Show') !== -1){
			$('.below15').show();
			$(this).text("Hide Stocks under 15np/share");
		}else{
			$('.below15').hide();
			$(this).text("Show Stocks under 15np/share");		
		}
	});
	
	$list.find('tr:contains("Ticker"):first').unwrap().wrap('<thead></thead>').find('td').each(function(){
		$(this).replaceWith(function () {
			return $('<th>', {
				html: this.innerHTML
			});
		});
	});

	$('.list > tr').wrapAll('<tbody></tbody>');

	$('.list thead th b').unwrap();

	$('.list').tablesorter({
		// default sort by current price in desc order
		sortList: [[4,0]]
	});
}

if(page.indexOf("stockmarket.phtml?type=portfolio") !== -1){
	// we're on the portfolio page
	
	var script = "function disclose(id) { if (document.getElementById(id + 'disclosure').src == 'http://i.imgur.com/fWPnmTg.png') { document.getElementById(id + 'disclosure').src = 'http://i.imgur.com/EbvS1oi.png'; document.getElementById(id).style.display = 'none'; stk_cnt++; } else { document.getElementById(id + 'disclosure').src ='http://i.imgur.com/fWPnmTg.png'; document.getElementById(id).style.display = ''; stk_cnt--; } if(stk_cnt) { document.getElementById('show_sell').style.display = 'block'; } else { document.getElementById('show_sell').style.display = 'none'; } }";
	
	$("body").append("<script>"+script+"</script>");

	var css = ".portfolio > .totals td { border: 0px; background-color: #bdc3c7; padding: 4px; } table.tablesorter thead tr th, table.tablesorter tfoot tr th { background-color: #e6EEEE; border: 1px solid #FFF; font-size: 8pt; padding: 4px; } table.tablesorter thead tr .header { background-image: url('https://raw.githubusercontent.com/christianbach/tablesorter/master/themes/blue/bg.gif'); background-repeat: no-repeat; background-position: center right; cursor: pointer; padding-right: 20px; } table.tablesorter tbody td { padding: 4px; border: 0px; vertical-align: top; } table.tablesorter tbody tr.odd td { background-color:#F0F0F6; } table.tablesorter thead tr .headerSortUp { background-image: url('https://raw.githubusercontent.com/christianbach/tablesorter/master/themes/blue/asc.gif'); } table.tablesorter thead tr .headerSortDown { background-image: url('https://raw.githubusercontent.com/christianbach/tablesorter/master/themes/blue/desc.gif'); } table.tablesorter thead tr .headerSortDown, table.tablesorter thead tr .headerSortUp { background-color: #8dbdd8; }";

	$('<style type="text/css"></style>').html(css).appendTo("head");

	$('td.content > div:eq(1)').attr('style','');

	$port = $("form[id='postForm'] > table");

	$port.addClass('portfolio tablesorter').css({'margin-top':'15px','border':'0px'});
	$('.portfolio tr:eq(0):first').remove();
	$port.find('tr:contains("Icon"):first').unwrap().wrap('<thead></thead>').find('td').each(function(){
		$(this).replaceWith(function () {
			return $('<th>', {
				html: this.innerHTML
			});
		});
	});

	$totals = $('.portfolio > tr:last');
	var totals = $('.portfolio > tr:last').html();
	$totals.remove();

	$('.portfolio > tr').wrapAll('<tbody></tbody>');
	$('.portfolio > tbody:first').after("<tr class='totals'>"+totals+"</tr>");		
	$('.portfolio tr:hidden').addClass("expand-child");
	$('.portfolio').tablesorter({
		
		headers: {
			5: {
                sorter:'thousands'
			},
			6: {
                sorter:'thousands'
			},
			7: {
                sorter:'thousands'
            }
    	},
		// default sort by current price in desc order
		sortList: [[3,1]]
	});

	$port.find('tr:contains("profile")').each(function(){
		if($(this).find('td:eq(3)').text() >= minValue){
			$(this).css("background-color","#bdc3c7"); // color for highlight, feel free to change using hexcode.
		}else{
			$(this).css("background-color","#FFFFFF");	
		}
	});

	$('.portfolio .expand-child table').each(function(){
		$(this).css('border','1px solid black');
		$(this).find('tr:eq(0) > td:last b').after(' [<a href="#" class="medText fillAll">all</a> / <a href="#" class="medText clearAll">clear</a>]');
	});

	$port.find('tbody tr').each(function(){
		$(this).find('td:eq(1) a:contains("profile")').remove();
		$(this).find('td:eq(0) img:last').remove();
		$(this).find('td:eq(0) img').attr('src','http://i.imgur.com/EbvS1oi.png');
	});

	$port.find('thead tr:eq(0) th:eq(0)').remove();
	$port.find('thead tr:eq(0) th:eq(0)').attr("colspan","2");
	
	$('.fillAll').click(function(e){
		e.preventDefault();
		$(this).parent().parent().siblings().each(function(){
			var numShares = $(this).find('td:eq(0)').text().replace(/,/g , "");
			$(this).find('input:last').val(numShares);
		});
	});

	$('.clearAll').click(function(e){
		e.preventDefault();
		$(this).parent().parent().siblings().each(function(){
			$(this).find('input:last').val('');
		});
	});
	
	$(".totals td:eq(0)").attr('colspan','2').before("<td colspan='3' align='center'><b>Unique Stocks: "+$('.portfolio:first tbody > tr:not(".expand-child")').length + " / 43</b></td>");
}