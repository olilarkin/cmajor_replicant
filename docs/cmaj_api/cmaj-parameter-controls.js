//
//     ,ad888ba,                              88
//    d8"'    "8b
//   d8            88,dba,,adba,   ,aPP8A.A8  88
//   Y8,           88    88    88  88     88  88
//    Y8a.   .a8P  88    88    88  88,   ,88  88     (C)2024 Cmajor Software Ltd
//     '"Y888Y"'   88    88    88  '"8bbP"Y8  88     https://cmajor.dev
//                                           ,88
//                                        888P"
//
//  This file may be used under the terms of the ISC license:
//
//  Permission to use, copy, modify, and/or distribute this software for any purpose with or
//  without fee is hereby granted, provided that the above copyright notice and this permission
//  notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
//  WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
//  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
//  CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
//  WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
//  CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

import { PatchConnection } from "./cmaj-patch-connection.js";


//==============================================================================
/** A base class for parameter controls, which automatically connects to a
 *  PatchConnection to monitor a parameter and provides methods to modify it.
 */
export class ParameterControlBase  extends HTMLElement
{
    constructor()
    {
        super();

        // prevent any clicks from focusing on this element
        this.onmousedown = e => e.stopPropagation();
    }

    /** Attaches the control to a given PatchConnection and endpoint.
     *
     * @param {PatchConnection} patchConnection - the connection to connect to, or pass
     *                                            undefined to disconnect the control.
     * @param {Object} endpointInfo - the endpoint details, as provided by a PatchConnection
     *                                in its status callback.
     */
    setEndpoint (patchConnection, endpointInfo)
    {
        this.detachListener();

        this.patchConnection = patchConnection;
        this.endpointInfo = endpointInfo;
        this.defaultValue = endpointInfo.annotation?.init || endpointInfo.defaultValue || 0;

        if (this.isConnected)
            this.attachListener();
    }

    /** Override this method in a child class, and it will be called when the parameter value changes,
     *  so you can update the GUI appropriately.
     */
    valueChanged (newValue) {}

    /** Your GUI can call this when it wants to change the parameter value. */
    setValue (value)     { this.patchConnection?.sendEventOrValue (this.endpointInfo.endpointID, value); }

    /** Call this before your GUI begins a modification gesture.
     *  You might for example call this if the user begins a mouse-drag operation.
     */
    beginGesture()       { this.patchConnection?.sendParameterGestureStart (this.endpointInfo.endpointID); }

    /** Call this after your GUI finishes a modification gesture */
    endGesture()         { this.patchConnection?.sendParameterGestureEnd (this.endpointInfo.endpointID); }

    /** This calls setValue(), but sandwiches it between some start/end gesture calls.
     *  You should use this to make sure a DAW correctly records automatiion for individual value changes
     *  that are not part of a gesture.
     */
    setValueAsGesture (value)
    {
        this.beginGesture();
        this.setValue (value);
        this.endGesture();
    }

    /** Resets the parameter to its default value */
    resetToDefault()
    {
        if (this.defaultValue !== null)
            this.setValueAsGesture (this.defaultValue);
    }

    //==============================================================================
    /** @private */
    connectedCallback()
    {
        this.attachListener();
    }

    /** @protected */
    disconnectedCallback()
    {
        this.detachListener();
    }

    /** @private */
    detachListener()
    {
        if (this.listener)
        {
            this.patchConnection?.removeParameterListener?.(this.listener.endpointID, this.listener);
            this.listener = undefined;
        }
    }

    /** @private */
    attachListener()
    {
        if (this.patchConnection && this.endpointInfo)
        {
            this.detachListener();

            this.listener = newValue => this.valueChanged (newValue);
            this.listener.endpointID = this.endpointInfo.endpointID;

            this.patchConnection.addParameterListener (this.endpointInfo.endpointID, this.listener);
            this.patchConnection.requestParameterValue (this.endpointInfo.endpointID);
        }
    }
}

//==============================================================================
/** A simple rotary parameter knob control. */
export class Knob  extends ParameterControlBase
{
    constructor (patchConnection, endpointInfo)
    {
        super();
        this.setEndpoint (patchConnection, endpointInfo);
    }

    setEndpoint (patchConnection, endpointInfo)
    {
        super.setEndpoint (patchConnection, endpointInfo);

        this.innerHTML = "";
        this.className = "knob-container";
        const min = endpointInfo?.annotation?.min || 0;
        const max = endpointInfo?.annotation?.max || 1;

        const createSvgElement = tag => window.document.createElementNS ("http://www.w3.org/2000/svg", tag);

        const svg = createSvgElement ("svg");
        svg.setAttribute ("viewBox", "0 0 100 100");

        const trackBackground = createSvgElement ("path");
        trackBackground.setAttribute ("d", "M20,76 A 40 40 0 1 1 80 76");
        trackBackground.classList.add ("knob-path");
        trackBackground.classList.add ("knob-track-background");

        const maxKnobRotation = 132;
        const isBipolar = min + max === 0;
        const dashLength = isBipolar ? 251.5 : 184;
        const valueOffset = isBipolar ? 0 : 132;
        this.getDashOffset = val => dashLength - 184 / (maxKnobRotation * 2) * (val + valueOffset);

        this.trackValue = createSvgElement ("path");

        this.trackValue.setAttribute ("d", isBipolar ? "M50.01,10 A 40 40 0 1 1 50 10"
                                                     : "M20,76 A 40 40 0 1 1 80 76");
        this.trackValue.setAttribute ("stroke-dasharray", dashLength);
        this.trackValue.classList.add ("knob-path");
        this.trackValue.classList.add ("knob-track-value");

        this.dial = document.createElement ("div");
        this.dial.className = "knob-dial";

        const dialTick = document.createElement ("div");
        dialTick.className = "knob-dial-tick";
        this.dial.appendChild (dialTick);

        svg.appendChild (trackBackground);
        svg.appendChild (this.trackValue);

        this.appendChild (svg);
        this.appendChild (this.dial);

        const remap = (source, sourceFrom, sourceTo, targetFrom, targetTo) =>
                        (targetFrom + (source - sourceFrom) * (targetTo - targetFrom) / (sourceTo - sourceFrom));

        const toValue = (knobRotation) => remap (knobRotation, -maxKnobRotation, maxKnobRotation, min, max);
        this.toRotation = (value) => remap (value, min, max, -maxKnobRotation, maxKnobRotation);

        this.rotation = this.toRotation (this.defaultValue);
        this.setRotation (this.rotation, true);

        const onMouseMove = (event) =>
        {
            event.preventDefault(); // avoid scrolling whilst dragging

            const nextRotation = (rotation, delta) =>
            {
                const clamp = (v, min, max) => Math.min (Math.max (v, min), max);
                return clamp (rotation - delta, -maxKnobRotation, maxKnobRotation);
            };

            const workaroundBrowserIncorrectlyCalculatingMovementY = event.movementY === event.screenY;
            const movementY = workaroundBrowserIncorrectlyCalculatingMovementY ? event.screenY - this.previousScreenY
                                                                               : event.movementY;
            this.previousScreenY = event.screenY;

            const speedMultiplier = event.shiftKey ? 0.25 : 1.5;
            this.accumulatedRotation = nextRotation (this.accumulatedRotation, movementY * speedMultiplier);
            this.setValue (toValue (this.accumulatedRotation));
        };

        const onMouseUp = (event) =>
        {
            this.previousScreenY = undefined;
            this.accumulatedRotation = undefined;
            window.removeEventListener ("mousemove", onMouseMove);
            window.removeEventListener ("mouseup", onMouseUp);
            this.endGesture();
        };

        const onMouseDown = (event) =>
        {
            this.previousScreenY = event.screenY;
            this.accumulatedRotation = this.rotation;
            this.beginGesture();
            window.addEventListener ("mousemove", onMouseMove);
            window.addEventListener ("mouseup", onMouseUp);
            event.preventDefault();
        };

        const onTouchStart = (event) =>
        {
            this.previousClientY = event.changedTouches[0].clientY;
            this.accumulatedRotation = this.rotation;
            this.touchIdentifier = event.changedTouches[0].identifier;
            this.beginGesture();
            window.addEventListener ("touchmove", onTouchMove);
            window.addEventListener ("touchend", onTouchEnd);
            event.preventDefault();
        };

        const onTouchMove = (event) =>
        {
            for (const touch of event.changedTouches)
            {
                if (touch.identifier == this.touchIdentifier)
                {
                    const nextRotation = (rotation, delta) =>
                    {
                        const clamp = (v, min, max) => Math.min (Math.max (v, min), max);
                        return clamp (rotation - delta, -maxKnobRotation, maxKnobRotation);
                    };

                    const movementY = touch.clientY - this.previousClientY;
                    this.previousClientY = touch.clientY;

                    const speedMultiplier = event.shiftKey ? 0.25 : 1.5;
                    this.accumulatedRotation = nextRotation (this.accumulatedRotation, movementY * speedMultiplier);
                    this.setValue (toValue (this.accumulatedRotation));
                }
            }
        };

        const onTouchEnd = (event) =>
        {
            this.previousClientY = undefined;
            this.accumulatedRotation = undefined;
            window.removeEventListener ("touchmove", onTouchMove);
            window.removeEventListener ("touchend", onTouchEnd);
            this.endGesture();
        };

        this.addEventListener ("mousedown", onMouseDown);
        this.addEventListener ("dblclick", () => this.resetToDefault());
        this.addEventListener ('touchstart', onTouchStart);
    }

    /** Returns true if this type of control is suitable for the given endpoint info */
    static canBeUsedFor (endpointInfo)
    {
        return endpointInfo.purpose === "parameter";
    }

    /** @override */
    valueChanged (newValue)       { this.setRotation (this.toRotation (newValue), false); }

    /** Returns a string version of the given value */
    getDisplayValue (v)           { return toFloatDisplayValueWithUnit (v, this.endpointInfo); }

    /** @private */
    setRotation (degrees, force)
    {
        if (force || this.rotation !== degrees)
        {
            this.rotation = degrees;
            this.trackValue.setAttribute ("stroke-dashoffset", this.getDashOffset (this.rotation));
            this.dial.style.transform = `translate(-50%,-50%) rotate(${degrees}deg)`;
        }
    }

    /** @private */
    static getCSS()
    {
        return `
        .knob-container {
            --knob-track-background-color: var(--background);
            --knob-track-value-color: var(--foreground);

            --knob-dial-border-color: var(--foreground);
            --knob-dial-background-color: var(--background);
            --knob-dial-tick-color: var(--foreground);

            position: relative;
            display: inline-block;
            height: 5rem;
            width: 5rem;
            margin: 0;
            padding: 0;
        }

        .knob-path {
            fill: none;
            stroke-linecap: round;
            stroke-width: 0.15rem;
        }

        .knob-track-background {
            stroke: var(--knob-track-background-color);
        }

        .knob-track-value {
            stroke: var(--knob-track-value-color);
        }

        .knob-dial {
            position: absolute;
            text-align: center;
            height: 60%;
            width: 60%;
            top: 50%;
            left: 50%;
            border: 0.15rem solid var(--knob-dial-border-color);
            border-radius: 100%;
            box-sizing: border-box;
            transform: translate(-50%,-50%);
            background-color: var(--knob-dial-background-color);
        }

        .knob-dial-tick {
            position: absolute;
            display: inline-block;

            height: 1rem;
            width: 0.15rem;
            background-color: var(--knob-dial-tick-color);
        }`;
    }
}

//==============================================================================
/** A boolean switch control */
export class Switch  extends ParameterControlBase
{
    constructor (patchConnection, endpointInfo)
    {
        super();
        this.setEndpoint (patchConnection, endpointInfo);
    }

    setEndpoint (patchConnection, endpointInfo)
    {
        super.setEndpoint (patchConnection, endpointInfo);

        const outer = document.createElement ("div");
        outer.classList = "switch-outline";

        const inner = document.createElement ("div");
        inner.classList = "switch-thumb";

        this.innerHTML = "";
        this.currentValue = this.defaultValue > 0.5;
        this.valueChanged (this.currentValue);
        this.classList.add ("switch-container");

        outer.appendChild (inner);
        this.appendChild (outer);
        this.addEventListener ("click", () => this.setValueAsGesture (this.currentValue ? 0 : 1.0));
    }

    /** Returns true if this type of control is suitable for the given endpoint info */
    static canBeUsedFor (endpointInfo)
    {
        return endpointInfo.purpose === "parameter"
                && endpointInfo.annotation?.boolean;
    }

    /** @override */
    valueChanged (newValue)
    {
        const b = newValue > 0.5;
        this.currentValue = b;
        this.classList.remove (! b ? "switch-on" : "switch-off");
        this.classList.add (b ? "switch-on" : "switch-off");
    }

    /** Returns a string version of the given value */
    getDisplayValue (v)   { return `${v > 0.5 ? "On" : "Off"}`; }

    /** @private */
    static getCSS()
    {
        return `
        .switch-container {
            --switch-outline-color: var(--foreground);
            --switch-thumb-color: var(--foreground);
            --switch-on-background-color: var(--background);
            --switch-off-background-color: var(--background);

            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            width: 100%;
            margin: 0;
            padding: 0;
        }

        .switch-outline {
            position: relative;
            display: inline-block;
            height: 1.25rem;
            width: 2.5rem;
            border-radius: 10rem;
            box-shadow: 0 0 0 0.15rem var(--switch-outline-color);
            transition: background-color 0.1s cubic-bezier(0.5, 0, 0.2, 1);
        }

        .switch-thumb {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%,-50%);
            height: 1rem;
            width: 1rem;
            background-color: var(--switch-thumb-color);
            border-radius: 100%;
            transition: left 0.1s cubic-bezier(0.5, 0, 0.2, 1);
        }

        .switch-off .switch-thumb {
            left: 25%;
            background: none;
            border: var(--switch-thumb-color) solid 0.1rem;
            height: 0.8rem;
            width: 0.8rem;
        }
        .switch-on .switch-thumb {
            left: 75%;
        }

        .switch-off .switch-outline {
            background-color: var(--switch-on-background-color);
        }
        .switch-on .switch-outline {
            background-color: var(--switch-off-background-color);
        }`;
    }
}

//==============================================================================
function toFloatDisplayValueWithUnit (v, endpointInfo)
{
    return `${v.toFixed (2)} ${endpointInfo.annotation?.unit ?? ""}`;
}

//==============================================================================
/** A control that allows an item to be selected from a drop-down list of options */
export class Options  extends ParameterControlBase
{
    constructor (patchConnection, endpointInfo)
    {
        super();
        this.setEndpoint (patchConnection, endpointInfo);
    }

    setEndpoint (patchConnection, endpointInfo)
    {
        super.setEndpoint (patchConnection, endpointInfo);

        const toValue = (min, step, index) => min + (step * index);
        const toStepCount = count => count > 0 ? count - 1 : 1;

        const { min, max, options } = (() =>
        {
            if (this.hasTextOptions (endpointInfo))
            {
                const optionList = endpointInfo.annotation.text.split ("|");
                const stepCount = toStepCount (optionList.length);
                let min = 0, max = stepCount, step = 1;

                if (endpointInfo.annotation.min != null && endpointInfo.annotation.max != null)
                {
                    min = endpointInfo.annotation.min;
                    max = endpointInfo.annotation.max;
                    step = (max - min) / stepCount;
                }

                const options = optionList.map ((text, index) => ({ value: toValue (min, step, index), text }));

                return { min, max, options };
            }

            if (this.isExplicitlyDiscrete (endpointInfo))
            {
                const step = endpointInfo.annotation.step;

                const min = endpointInfo.annotation?.min || 0;
                const max = endpointInfo.annotation?.max || 1;

                const numDiscreteOptions = (((max - min) / step) | 0) + 1;

                const options = new Array (numDiscreteOptions);
                for (let i = 0; i < numDiscreteOptions; ++i)
                {
                    const value = toValue (min, step, i);
                    options[i] = { value, text: toFloatDisplayValueWithUnit (value, endpointInfo) };
                }

                return { min, max, options };
            }
        })();

        this.options = options;

        const stepCount = toStepCount (this.options.length);
        const normalise = value => (value - min) / (max - min);
        this.toIndex = value => Math.min (stepCount, normalise (value) * this.options.length) | 0;

        this.innerHTML = "";

        this.select = document.createElement ("select");

        for (const option of this.options)
        {
            const optionElement = document.createElement ("option");
            optionElement.innerText = option.text;
            this.select.appendChild (optionElement);
        }

        this.selectedIndex = this.toIndex (this.defaultValue);

        this.select.addEventListener ("change", (e) =>
        {
            const newIndex = e.target.selectedIndex;

            // prevent local state change. the caller will update us when the backend actually applies the update
            e.target.selectedIndex = this.selectedIndex;

            this.setValueAsGesture (this.options[newIndex].value)
        });

        this.valueChanged (this.selectedIndex);

        this.className = "select-container";
        this.appendChild (this.select);

        const icon = document.createElement ("span");
        icon.className = "select-icon";
        this.appendChild (icon);
    }

    /** Returns true if this type of control is suitable for the given endpoint info */
    static canBeUsedFor (endpointInfo)
    {
        return endpointInfo.purpose === "parameter"
                && (this.hasTextOptions (endpointInfo) || this.isExplicitlyDiscrete (endpointInfo));
    }

    /** @override */
    valueChanged (newValue)
    {
        const index = this.toIndex (newValue);
        this.selectedIndex = index;
        this.select.selectedIndex = index;
    }

    /** Returns a string version of the given value */
    getDisplayValue (v)    { return this.options[this.toIndex(v)].text; }

    /** @private */
    static hasTextOptions (endpointInfo)
    {
        return endpointInfo.annotation?.text?.split?.("|").length > 1
    }

    /** @private */
    static isExplicitlyDiscrete (endpointInfo)
    {
        return endpointInfo.annotation?.discrete && endpointInfo.annotation?.step > 0;
    }

    /** @private */
    static getCSS()
    {
        return `
        .select-container {
            position: relative;
            display: block;
            font-size: 0.8rem;
            width: 100%;
            color: var(--foreground);
            border: 0.15rem solid var(--foreground);
            border-radius: 0.6rem;
            margin: 0;
            padding: 0;
        }

        select {
            background: none;
            appearance: none;
            -webkit-appearance: none;
            font-family: inherit;
            font-size: 0.8rem;

            overflow: hidden;
            text-overflow: ellipsis;

            padding: 0 1.5rem 0 0.6rem;

            outline: none;
            color: var(--foreground);
            height: 2rem;
            box-sizing: border-box;
            margin: 0;
            border: none;

            width: 100%;
        }

        select option {
            background: var(--background);
            color: var(--foreground);
        }

        .select-icon {
            position: absolute;
            right: 0.3rem;
            top: 0.5rem;
            pointer-events: none;
            background-color: var(--foreground);
            width: 1.4em;
            height: 1.4em;
            mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17,9.17a1,1,0,0,0-1.41,0L12,12.71,8.46,9.17a1,1,0,0,0-1.41,0,1,1,0,0,0,0,1.42l4.24,4.24a1,1,0,0,0,1.42,0L17,10.59A1,1,0,0,0,17,9.17Z'/%3E%3C/svg%3E");
            mask-repeat: no-repeat;
            -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17,9.17a1,1,0,0,0-1.41,0L12,12.71,8.46,9.17a1,1,0,0,0-1.41,0,1,1,0,0,0,0,1.42l4.24,4.24a1,1,0,0,0,1.42,0L17,10.59A1,1,0,0,0,17,9.17Z'/%3E%3C/svg%3E");
            -webkit-mask-repeat: no-repeat;
        }`;
    }
}

//==============================================================================
/** A control which wraps a child control, adding a label and value display box below it */
export class LabelledControlHolder  extends ParameterControlBase
{
    constructor (patchConnection, endpointInfo, childControl)
    {
        super();
        this.childControl = childControl;
        this.setEndpoint (patchConnection, endpointInfo);
    }

    setEndpoint (patchConnection, endpointInfo)
    {
        super.setEndpoint (patchConnection, endpointInfo);

        this.innerHTML = "";
        this.className = "labelled-control";

        const centeredControl = document.createElement ("div");
        centeredControl.className = "labelled-control-centered-control";

        centeredControl.appendChild (this.childControl);

        const titleValueHoverContainer = document.createElement ("div");
        titleValueHoverContainer.className = "labelled-control-label-container";

        const nameText = document.createElement ("div");
        nameText.classList.add ("labelled-control-name");
        nameText.innerText = endpointInfo.annotation?.name || endpointInfo.name || endpointInfo.endpointID || "";

        this.valueText = document.createElement ("div");
        this.valueText.classList.add ("labelled-control-value");

        titleValueHoverContainer.appendChild (nameText);
        titleValueHoverContainer.appendChild (this.valueText);

        this.appendChild (centeredControl);
        this.appendChild (titleValueHoverContainer);
    }

    /** @override */
    valueChanged (newValue)
    {
        this.valueText.innerText = this.childControl?.getDisplayValue (newValue);
    }

    /** @private */
    static getCSS()
    {
        return `
        .labelled-control {
            --labelled-control-font-color: var(--foreground);
            --labelled-control-font-size: 0.8rem;

            position: relative;
            display: inline-block;
            margin: 0 0.4rem 0.4rem;
            vertical-align: top;
            text-align: left;
            padding: 0;
        }

        .labelled-control-centered-control {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;

            width: 5.5rem;
            height: 5rem;
        }

        .labelled-control-label-container {
            position: relative;
            display: block;
            max-width: 5.5rem;
            margin: -0.4rem auto 0.4rem;
            text-align: center;
            font-size: var(--labelled-control-font-size);
            color: var(--labelled-control-font-color);
            cursor: default;
        }

        .labelled-control-name {
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .labelled-control-value {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: 0;
        }

        .labelled-control:hover .labelled-control-name,
        .labelled-control:active .labelled-control-name {
            opacity: 0;
        }
        .labelled-control:hover .labelled-control-value,
        .labelled-control:active .labelled-control-value {
            opacity: 1;
        }`;
    }
}

window.customElements.define ("cmaj-knob-control", Knob);
window.customElements.define ("cmaj-switch-control", Switch);
window.customElements.define ("cmaj-options-control", Options);
window.customElements.define ("cmaj-labelled-control-holder", LabelledControlHolder);

//==============================================================================
/** Fetches all the CSS for the controls defined in this module */
export function getAllCSS()
{
    return `
        ${Options.getCSS()}
        ${Knob.getCSS()}
        ${Switch.getCSS()}
        ${LabelledControlHolder.getCSS()}`;
}

//==============================================================================
/** Creates a suitable control for the given endpoint.
 *
 *  @param {PatchConnection} patchConnection - the connection to connect to
 *  @param {Object} endpointInfo - the endpoint details, as provided by a PatchConnection
 *                                 in its status callback.
*/
export function createControl (patchConnection, endpointInfo)
{
    if (Switch.canBeUsedFor (endpointInfo))
        return new Switch (patchConnection, endpointInfo);

    if (Options.canBeUsedFor (endpointInfo))
        return new Options (patchConnection, endpointInfo);

    if (Knob.canBeUsedFor (endpointInfo))
        return new Knob (patchConnection, endpointInfo);

    return undefined;
}

//==============================================================================
/** Creates a suitable labelled control for the given endpoint.
 *
 *  @param {PatchConnection} patchConnection - the connection to connect to
 *  @param {Object} endpointInfo - the endpoint details, as provided by a PatchConnection
 *                                 in its status callback.
*/
export function createLabelledControl (patchConnection, endpointInfo)
{
    const control = createControl (patchConnection, endpointInfo);

    if (control)
        return new LabelledControlHolder (patchConnection, endpointInfo, control);

    return undefined;
}

//==============================================================================
/** Takes a patch connection and its current status object, and tries to create
 *  a control for the given endpoint ID.
 *
 *  @param {PatchConnection} patchConnection - the connection to connect to
 *  @param {Object} status - the connection's current status
 *  @param {string} endpointID - the endpoint you'd like to control
 */
export function createLabelledControlForEndpointID (patchConnection, status, endpointID)
{
    for (const endpointInfo of status?.details?.inputs)
        if (endpointInfo.endpointID == endpointID)
            return createLabelledControl (patchConnection, endpointInfo);

    return undefined;
}
