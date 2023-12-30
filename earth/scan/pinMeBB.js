function pinMeBB(
    elID,
    data = {
        limit: 5,
        minChar: 5,
        show: 0,
    }
) {
    if ((data.minChar || data.limit) > data.limit) data.limit = data.minChar;
    var el = document.getElementById(elID);
    el.insertAdjacentHTML(
        "beforeend",
        `
        <form autocomplete="off">
            <input id='displayPass' readonly type="text" autocomplete="off" maxlength="${data.limit}"/></br>
            <input type='hidden' id="password" maxlength="${data.limit}"/>
            <input type="button" value="1" id="1" class="pinButton calc"/>
            <input type="button" value="2" id="2" class="pinButton calc"/>
            <input type="button" value="3" id="3" class="pinButton calc"/><br>
            <input type="button" value="4" id="4" class="pinButton calc"/>
            <input type="button" value="5" id="5" class="pinButton calc"/>
            <input type="button" value="6" id="6" class="pinButton calc"/><br>
            <input type="button" value="7" id="7" class="pinButton calc"/>
            <input type="button" value="8" id="8" class="pinButton calc"/>
            <input type="button" value="9" id="9" class="pinButton calc"/><br>
            <input type="button" value="clear" id="clear" class="pinButton clear"/>
            <input type="button" value="0" id="0 " class="pinButton calc"/>
            <input type="button" value="enter" id="enter" class="pinButton enter"/>
        </form>
    `
    );

    const input_value = document.getElementById("password");
    const display_value = document.getElementById("displayPass");

    const eventEnter = new CustomEvent("onEnter", {
        bubbles: true,
        detail: { password: () => input_value.value },
    });

    const eventMaxed = new CustomEvent("onMaxChar",{
        detail: { password: () => input_value.value },
    });
    const eventEmpty = new CustomEvent("onEmpty",{
        detail: { password: () => input_value.value },
    });

    function field(value) {
        if (input_value.value.length >= data.limit) {
            el.dispatchEvent(eventMaxed);
        } else {
            input_value.value = input_value.value + value;
            // TODO if show == 1 display_value.value = display_value.value + value;
            display_value.value += data.show === 1 ? value : "*";
        }
    }

    document
        .getElementById("enter")
        .addEventListener("click", (e) =>
            el.dispatchEvent(
                input_value.value.length < (data.minChar || data.limit)
                    ? eventEmpty
                    : eventEnter
            )
        );
    document.getElementById("clear").addEventListener("click", (e) => {
        input_value.value = "";
        display_value.value = "";
    });

    var pads = document.getElementsByClassName("calc");
    for (var i = 0; i < pads.length; i++) {
        pads[i].addEventListener("click", (e) => {
            field(e.target.value);
        });
        pads[i].addEventListener("keydown", (e) => {
            if (e.keyCode === 13) {
                e.preventDefault();
            }
        });
    }

    return el;
}
