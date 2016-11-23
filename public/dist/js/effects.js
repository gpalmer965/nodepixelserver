/*


Partially copied from:
https://github.com/cwilso/Audio-Input-Effects

The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. */


"use strict";
window.AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext = new AudioContext();
var audioInput = null,
    realAudioInput = null,
    effectInput = null,
    //wetGain = null,
    dryGain = null,
    //outputMix = null,
    currentEffectNode = null,
    dtime = null,
    dregen = null;

var rafID = null;
var analyser1;
//var analyser2;
//var analyserView1;
var bufferLength;
var dataArray;
var canvasElem;
var canvasCtx;
var DATALENGTH = 2048;
var freqRange = {min:0, max:DATALENGTH};

// Create the event.
var soundDataEvent;
var detailOut;

var constraints =
{
  audio: {
      optional: [{ echoCancellation: false }]
  }
};

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

//window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
//window.cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame;

function cancelAnalyserUpdates() {
    if (rafID)
        window.cancelAnimationFrame( rafID );
    rafID = null;
}

function updateAnalysers(time) {
    //analyserView1.doFrequencyAnalysis( analyser1 );
    //analyserView2.doFrequencyAnalysis( analyser2 );
	draw();

    rafID = window.requestAnimationFrame( updateAnalysers );
}

function updateMinFreqRange(valueIn) {

	freqRange.min = valueIn;
	console.log("freqRange.min set to: " + valueIn);

}

function updateMaxFreqRange(valueIn) {

	freqRange.max = valueIn;
	console.log("freqRange.max set to: " + valueIn);
}

function draw() {

  //drawVisual = requestAnimationFrame(draw);

  analyser1.getByteFrequencyData(dataArray);
  // target can be any Element or other EventTarget.
  canvasElem.dispatchEvent(soundDataEvent);

  var WIDTH = canvasElem.width;
  var HEIGHT = canvasElem.height;

  canvasCtx.fillStyle = 'rgb(250, 150, 150)';
  canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = 'rgb(0, 0, 200)';

  canvasCtx.beginPath();

  var sliceWidth = WIDTH * 1.0 / (freqRange.max-freqRange.min);
  var x = 0;

  for(var i = freqRange.min; i < freqRange.max; i++) {

	//var v = dataArray[i] / 128.0;
	//var y = v * HEIGHT/2;
	var y = HEIGHT - (dataArray[i]*HEIGHT/255);
	if(i === 0) {
	  canvasCtx.moveTo(x, y);
	} else {
	  canvasCtx.lineTo(x, y);
	}

	x += sliceWidth;
  }

  canvasCtx.lineTo(WIDTH, HEIGHT/2);
  canvasCtx.stroke();


}





var lpInputFilter=null;

// this is ONLY because we have massive feedback without filtering out
// the top end in live speaker scenarios.
function createLPInputFilter() {
    lpInputFilter = audioContext.createBiquadFilter();
    lpInputFilter.frequency.value = 2048;
    return lpInputFilter;
}


function toggleMono() {
    if (audioInput != realAudioInput) {
        audioInput.disconnect();
        realAudioInput.disconnect();
        audioInput = realAudioInput;
    } else {
        realAudioInput.disconnect();
        audioInput = convertToMono( realAudioInput );
    }

    //createLPInputFilter();
    //lpInputFilter.connect(dryGain);
    //lpInputFilter.connect(analyser1);
    //lpInputFilter.connect(effectInput);
}

var useFeedbackReduction = false;

function gotStream(stream) {
    // Create an AudioNode from the stream.
//    realAudioInput = audioContext.createMediaStreamSource(stream);
  //  var input = audioContext.createMediaStreamSource(stream);

	window.source = audioContext.createMediaStreamSource(stream);
	//source.connect(audioContext.destination);

    audioInput = convertToMono( source );
	//audioInput = input;

    if (useFeedbackReduction) {
        audioInput.connect( createLPInputFilter() );
        lpInputFilter.connect(dryGain);
        lpInputFilter.connect(analyser1);
        lpInputFilter.connect(effectInput);
        audioInput = lpInputFilter;

    }
    // create mix gain nodes
    dryGain = audioContext.createGain();
    effectInput = audioContext.createGain();
    audioInput.connect(dryGain);
    audioInput.connect(analyser1);
    audioInput.connect(effectInput);
    changeEffect();
    cancelAnalyserUpdates();
    updateAnalysers();
}

function getUsrMedia(constraints) {
    // Older browsers might not implement mediaDevices at all, so we set an empty object first
    if (navigator.mediaDevices === undefined) {
      navigator.mediaDevices = {};
    }

    // Some browsers partially implement mediaDevices. We can't just assign an object
    // with getUserMedia as it would overwrite existing properties.
    // Here, we will just add the getUserMedia property if it's missing.
    if (navigator.mediaDevices.getUserMedia === undefined) {
      navigator.mediaDevices.getUserMedia = function(constraints) {

        // First get ahold of the legacy getUserMedia, if present
        var getUserMedia = (navigator.getUserMedia ||
          navigator.webkitGetUserMedia ||
          navigator.mozGetUserMedia);

        // Some browsers just don't implement it - return a rejected promise with an error
        // to keep a consistent interface
        if (!getUserMedia) {
          return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
        }

        // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
        return new Promise(function(resolve, reject) {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      }
    }


    navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(function(e) {
  			alert('Error getting audio' + e.name + ": " + e.message);
  			console.log(e.name + ": " + e.message);
  		});


}

function initAudio() {

	canvasElem=document.getElementById("canvas1");
	canvasCtx=canvasElem.getContext("2d");

	analyser1 = audioContext.createAnalyser();
	analyser1.fftSize = DATALENGTH;
  analyser1.smoothingTimeConstant = 0.6; //0-1, 1 is max smoothing
  analyser1.maxDecibels = -40; //default -30
  analyser1.minDecibels = -110; //default -100

	freqRange.max = analyser1.frequencyBinCount;
	document.getElementById("minFreqInput").max = analyser1.frequencyBinCount;
	document.getElementById("maxFreqInput").max = analyser1.frequencyBinCount;
	document.getElementById("maxFreqInput").value = analyser1.frequencyBinCount;
	console.log("max freq bin: " + analyser1.frequencyBinCount);
	bufferLength = analyser1.frequencyBinCount;
	dataArray = new Uint8Array(bufferLength);

	detailOut = {dataArray:dataArray, freqRange:freqRange};
	soundDataEvent = new CustomEvent('SoundDataEvent', {detail:detailOut});

	// Listen for the event.
	canvasElem.addEventListener('SoundDataEvent', freqDataHandler, false);

  getUsrMedia(constraints);


}


window.addEventListener('load', initAudio );


var lastEffect = -1;

function changeEffect() {

    if (currentEffectNode)
        currentEffectNode.disconnect();
    if (effectInput)
        effectInput.disconnect();

    currentEffectNode = createDelay();

    audioInput.connect( currentEffectNode );
}



function createDelay() {
    var delayNode = audioContext.createDelay();

    delayNode.delayTime.value = 0; //parseFloat( document.getElementById("dtime").value );
    dtime = delayNode;

    var gainNode = audioContext.createGain();
    gainNode.gain.value = 1; //parseFloat( document.getElementById("dregen").value );
    dregen = gainNode;

    gainNode.connect( delayNode );
    delayNode.connect( gainNode );
    //delayNode.connect( wetGain );

    return delayNode;
}

function impulseResponse( duration, decay, reverse ) {
    var sampleRate = audioContext.sampleRate;
    var length = sampleRate * duration;
    var impulse = audioContext.createBuffer(2, length, sampleRate);
    var impulseL = impulse.getChannelData(0);
    var impulseR = impulse.getChannelData(1);

    if (!decay)
        decay = 2.0;
    for (var i = 0; i < length; i++){
      var n = reverse ? length - i : i;
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
    }
    return impulse;
}
