// ==UserScript==
// @name         Better Quick Stock
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  makes the quick stock in neopets a little bit better
// @author       brunodemarchi
// @match        *://*.neopets.com/quickstock.phtml*
// @grant        none
// ==/UserScript==

$(document).ready(function () {

	//removes neopets treatment
	$('[ondblclick]').each(function () {
		$(this).attr('ondblclick', '');
	});

	//select all
	$('input[name="checkall"]').attr('onclick', '').replaceWith('<input type="checkbox" class="check_all">');
	$('.check_all').on('click', function () {
		$('.check_all').not(this).removeAttr('checked');
		var $this = $(this),
			tdIndex = $this.parent().index(),
			checked = $this.is(':checked');

		$('form[name="quickstock"] tr').each(function () {
			var everyOtherTd = $(this).find('td:not(:eq(' + tdIndex + '))'),
				selectedTd = $(this).find('td').eq(tdIndex),
				radio = selectedTd.find('input[type="radio"]'),
				bgcolor = $(this)[0].getAttribute('bgcolor'),
				backgroundColor = bgcolor == "#FFFFFF" ? "#eee" : "#E5E5B7";

			if (checked) {
				everyOtherTd.each(function () {
					var radio = $(this).find('input[type="radio"]');

					$(this).css('background', "transparent");

					toggleChecked(radio, false, true);
				});
			}

			selectedTd.css('background', checked ? backgroundColor : "transparent");

			toggleChecked(radio, checked, !checked);
		});

	});

	$('input[type="radio"]').css('cursor', 'pointer');

	//adds background and triggers click
	$('input[type="radio"]').parent('form[name="quickstock"] td[align="center"]').on('click', function () {
		var radio = $(this).find('input[type="radio"]'),
			checked = !radio.hasClass("checked"),
			parent_tr = $(this).parent(),
			everyOtherTd = parent_tr.find('td').not(this);

		if (checked) {
			everyOtherTd.each(function () {
				var radio = $(this).find('input[type="radio"]');

				$(this).css('background', "transparent");

				toggleChecked(radio, false, true);
			});
		}


		toggleChecked(radio);
	}).on('hover', function (e) {
		var radio = $(this).find('input[type="radio"]'),
			bgcolor = $(this).parent('tr')[0].getAttribute('bgcolor'),
			backgroundColor = bgcolor == "#FFFFFF" ? "#eee" : "#E5E5B7";

		$(this).css('background', e.type === "mouseenter" ? backgroundColor : radio.hasClass('checked') ? backgroundColor : "transparent");
		$(this).css('cursor', e.type === "mouseenter" ? "pointer" : "auto");
	});

	//adds checkboxes for sections
	$('tr[bgcolor="#EEEEBB"]:gt(0), tr[bgcolor="#eeeebb"]').each(function () {
		var $this = $(this),
			th = $this.find('th:contains("Stock"),th:contains("Deposit"), th:contains("Donate"), th:contains("Discard"), th:contains("Gallery"), th:contains("Closet"), th:contains("Shed")');
		th.each(function () {
			$(this).append('<input type="checkbox" class="checkbox_all_section">');
		});
	});

	//checkboxes sections treatment
	$('.checkbox_all_section').on('click', function () {
		$('.checkbox_all_section').not(this).removeAttr('checked');
		var $this = $(this),
			checked = $this.is(':checked'),
			parent_td = $this.parent(),
			tdIndex = parent_td.index(),
			parent_tr = parent_td.parent(),
			next_tr_list = parent_tr.nextUntil('tr[bgcolor="#EEEEBB"], tr[bgcolor="#eeeebb"]');

		next_tr_list.each(function () {
			var $this = $(this),
				everyOtherTd = $this.find('td:not(:eq(' + tdIndex + '))'),
				selectedTd = $this.find('td').eq(tdIndex),
				radio = selectedTd.find('input[type="radio"]'),
				bgcolor = $this[0].getAttribute('bgcolor'),
				backgroundColor = bgcolor == "#FFFFFF" ? "#eee" : "#E5E5B7";

			if (checked) {
				everyOtherTd.each(function () {
					var radio = $(this).find('input[type="radio"]');

					$(this).css('background', "transparent");

					toggleChecked(radio, false, true);
				});
			}
			selectedTd.css('background', checked ? backgroundColor : "transparent");

			toggleChecked(radio, checked, !checked);
		});
	});

});

/***********************
 FUNCTIONS
 ***********************/

function toggleChecked(el, check, uncheck) {
	var check = check || "";
	var uncheck = uncheck || "";

	if (check) {
		el.prop('checked', true)
			.addClass('checked');
	} else if (uncheck) {
		el.prop('checked', false)
			.removeClass('checked');
	} else {
		if (el.hasClass('checked')) {
			el.prop('checked', false)
				.toggleClass('checked');
		} else {
			el.prop('checked', true)
				.toggleClass('checked');
		}
	}
}

