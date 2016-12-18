"use strict";
// initialize everything, web server, socket.io, filesystem, johnny-five
//
// to run:
// upload firmata to Uno from: ~\AppData\Roaming\npm\node_modules\node-pixel\firmware\src\controller_src\firmata
// Start server from node.js command prompt:   node app.js
// Open browser: localhost:3000
//
// to update:
// npm -g update
//
var express = require('express');
var app = express();
var server = require('http').Server(app);
var five = require("johnny-five");
var pixel = require('node-pixel');
var led = null;
var Color = require('color');
var io = require('socket.io')(server);

var USE_BACKPACK_MODE = true;

var board = null;
if (USE_BACKPACK_MODE) {
	var raspi = require("raspi-io");
	var opts = {};
	opts.io = new raspi();
	board = new five.Board(opts);

} else {
	board = new five.Board();
}

var strip = null;
var strip_intervals = [];
var strip_length = 90;     // number of pixels in the strip.
var strip_data_pin = 6;    // pin connected to data input on the strip


var light_pattern = ["Off", "Static Rainbow", "Dynamic Rainbow", "Dynamic Waves", "Chaser", "Rainbow Fade", "Random Burst", "Police Lights", "Flicker", "A0 Input Brightness", "A0 Input Level Strip", "Device Orientation", "Sound Volume", "Sound Frequency"];
var current_light_pattern = "Off";
var defaultDelay = 400;
var stripReady = false;
var refreshBlocker = false;
var minSoundRefreshTimeout = 200; //ms


var analog0 = 0;

// on board ready
board.on("ready", function() {
	// init a led on pin 13, strobe every 1000ms
	led = new five.Led(13).strobe(1000);

	// setup the node-pixel strip.
	if (USE_BACKPACK_MODE) {
		strip = new pixel.Strip({
        board: this,
        controller: "I2CBACKPACK",
				//bus: 2,
				strips: [strip_length]
    });

	} else{
		strip = new pixel.Strip({
			pin: strip_data_pin,
			length: strip_length,
			board: this,
			controller: "FIRMATA"
		});
	}

/*	var temp = new five.Sensor({
		pin: "A0",
		freq: 250,
		threshold: 5
	});

	sensor.on("change", function() {
		// sensor will return 0-1023 value for 0-5V input
		console.log( this.value );
		analog0 = this.value;
	});
	*/

	console.log('strip: ' + strip);

	strip.on("ready", function() {
		// do stuff with the strip here.
		console.log('strip is ready: ' + strip.isReady);
		console.log('strip2: ' + strip);

		strip.pixel(10).color("rgb(200,200,200)");
		strip.show();
		console.log('set pixel 10');
		stripReady=true;
		SetStripPattern(DynamicRainbow, defaultDelay); //set default initial pattern


		// on a socket connection
		io.on('connection', function (socket) {
			console.log('new connection');
			socket.emit('news', { hello: 'world' });
			socket.emit('strip_settings_functions', { func_list: light_pattern });


			// if led message received
			socket.on('led', function (data) {
				console.log(data);
				if(board.isReady){    led.strobe(data.delay); }
			});

			socket.on('text_data', function (data) {
				console.log(data);
			});

			socket.on('light_pattern', function(data) {
				console.log('strip4: ' + strip);

				console.log(data);
				current_light_pattern = data.pattern;

				if (board.isReady && stripReady) {
					switch (data.pattern) {
					case "Static Rainbow":
						strip.pixel(15).color("rgb(200,200,200)");
						strip.show();
						console.log('set pixel 15');
						SetStripPattern(StaticRainbow, defaultDelay);

						break;
					case "Dynamic Rainbow":
						SetStripPattern(DynamicRainbow, defaultDelay);
						break;
					case "Dynamic Waves":
						SetStripPattern(DynamicWaves, defaultDelay);
						break;
					case "Chaser":
						SetStripPattern(Chaser, defaultDelay);
						break;
					case "Rainbow Fade":
						SetStripPattern(rainbow_fade, defaultDelay);
						break;
					case "Random Burst":
						SetStripPattern(random_burst, defaultDelay);
						break;
					case "Police Lights":
						SetStripPattern(police_lights, defaultDelay);
						break;
					case "Flicker":
						SetStripPattern(flicker, defaultDelay);
						break;
					case "A0 Input Brightness":
						SetStripPattern(analog_input_brightness, defaultDelay);
						break;
					case "A0 Input Level Strip":
						SetStripPattern(analog_input_level, defaultDelay);
						break;
					case "Device Orientation":
						SetStripPattern(device_orientation, defaultDelay);
						break;
					case "Sound Volume":
						SetStripPattern(sound_volume, defaultDelay);
						break;
					case "Sound Frequency":
						SetStripPattern(sound_frequency, defaultDelay);
						break;

					case "Off":
						BlankStrip();
					}
				}
			});

			socket.on('ledColor', function(data) {
				console.log(data.index + ", " + data.rgb);
				if (board.isReady && stripReady) {
					if (data.index >= 0 && data.index < strip_length) {
						strip.pixel(data.index).color(data.rgb);
						strip.show();
					}
				}
			});

			socket.on('ledDelayTime', function(data) {
				console.log("Delay time set: " + data.delay);
				defaultDelay = data.delay;
			});


			socket.on('orientation', function(data) {
				var orientationRefreshTimeout = 10;
				if (!refreshBlocker){
					if (current_light_pattern != "Device Orientation") {
						return;
					}
					refreshBlocker = true;
					set_strip_hsl(Math.floor(180*data.ang/Math.PI), 100, 100*(data.r*data.r));

					//console.log("Orientation set: " + data.ang + ", " + data.r);
					setTimeout(function(){ refreshBlocker=false; }, orientationRefreshTimeout);
				}
			});

			socket.on('soundData', function(data) {
				//console.log(data.arr);
				//console.log(typeof data.arr);
				//console.log(data.arr.length);
				//console.log("received sound data, length: " + data.arr.length + ", mean: " + (arraySum(data.arr) / data.arr.length));
				if (current_light_pattern == "Sound Volume") {
					var max_i = indexOfMax(data.arr);
					//console.log("max index: " + max_i);

					var hue = max_i * 360.0 / (data.arr.length-1);
					var lum = arraySum(data.arr) / data.arr.length * 100 / 256;
					set_strip_hsl(hue, 100, lum);
				} else if (current_light_pattern == "Sound Frequency") {
					if (!refreshBlocker) {
						refreshBlocker = true;

						var showColor;

						for(var i = 0; i < strip_length; i++) {
							var hue = i * 360/strip_length;
							var sat = 100;
							var lum_i = Math.floor(i * strip_length/data.arr.length);
							var lum = data.arr[lum_i] * 100/255;
							//lum = lum*lum;
							showColor = (Color().hsl(hue, sat, lum)).rgb().color;
							strip.pixel( i ).color( showColor );
						}
						strip.show();

						setTimeout(function(){ refreshBlocker=false; }, minSoundRefreshTimeout);
					}

				} else {
					return;
				}

			});


		});

	});

});

server.listen(3000); // not 'app.listen'!
console.log("listening on 3000");

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/public/index.html');
});



function SetStripPattern(func, delay) {
	console.log("calling function: " + func);
	StopStripIntervals();

	var intervalIndex = func( delay );
	if (intervalIndex != null) {
		strip_intervals.push(intervalIndex);
	}
	console.log("strip_intervals: " + strip_intervals);
}

function DynamicRainbow( delay ){
	//delay = Math.max(delay, 200);
	console.log( 'DynamicRainbow, delay: ' + delay);

	var showColor;

	for(var i = 0; i < strip_length; i++) {
		showColor = colorWheel( (i*255/strip_length) );
		strip.pixel( i ).color( showColor );
	}
	strip.show();

	var intervalIndex = setInterval(function(){
		strip.shift(1, pixel.FORWARD, true);
		strip.show();

	}, delay);

	return intervalIndex;  //return interval index so it can be stopped later
};

function StaticRainbow( delay ){
	console.log('StaticRainbow');

	var showColor;
	for(var i = 0; i < strip_length; i++) {
		showColor = colorWheel( i*256 / strip_length );
		strip.pixel( i ).color( showColor );
	}
	strip.show();
	return null;  //no interval is set since it is static
}

function DynamicWaves( delay ){
	//delay = Math.max(delay, 200);
	console.log( 'DynamicWaves, delay: ' + delay );

	var showColor;
	var freq = 1/6*Math.PI;
	var cwi = 0; // colour wheel index (current position on colour wheel)

	for(var i = 0; i < strip_length; i++) {
		var level = 0.5*Math.sin(cwi+i*freq) + 0.5;
		showColor = colorWheel( (i*255/strip_length), level );
		strip.pixel( i ).color( showColor );
	}

	strip.show();
	var intervalIndex = setInterval(function(){
		strip.shift(1, pixel.FORWARD, true);
		strip.show();

	}, delay);

	return intervalIndex;  //return interval index so it can be stopped later
};

function Chaser( delay, width, speed ){

	//default values, these input arrays should be the same length, corresponding to each chaser
	width = typeof width !== 'undefined' ? width : 5;
	speed = typeof speed !== 'undefined' ? speed : 1;

	console.log( 'Chaser, delay: ' + delay );

	strip.off();

	var chaser_pos = 9; //position index of chaser
	console.log(chaser_pos);
	for (var i=0; i<strip_length; ++i) {


		var chaser_offset = Math.round(chaser_pos - i);
		chaser_offset = chaser_offset < 0 ? chaser_offset + strip_length : chaser_offset;


		if (chaser_offset < width) {

			var freq = Math.PI / width;

			/*var level = -0.5*Math.sin(chaser_offset*freq) + 0.5;

			level = level*level;
			level = Math.floor(level * 100);*/

			var level = 50;

			var hue = Math.floor(360 * chaser_offset / width);

			
			strip.pixel(i).color( Color().hsl(hue, 50, level).rgb().color );
		}


	}
	chaser_pos += speed;
	if (Math.round(chaser_pos) >= strip_length) {
		chaser_pos -= strip_length;
	}
	strip.show();
	var intervalIndex = setInterval(function(){
		strip.shift(1, pixel.FORWARD, true);
		strip.show();

	}, delay);
	return intervalIndex;  //return interval index so it can be stopped later
};

function rainbow_fade(delay) { //-FADE ALL LEDS THROUGH HSV RAINBOW
	var ihue = 0;
	var intervalIndex = setInterval(function(){
		//console.log(ihue);
		ihue+=3;
		//console.log(ihue);
		if (ihue > 359) {ihue = 0;}
		//console.log(ihue);
		set_strip_hsl(ihue, 100, 50);
	}, delay);
	return intervalIndex;
}

function set_strip_hsl(hue, sat, lum) {
	var color1 = Color().hsl(hue, sat, lum);
	strip.color(color1.rgb().color);
	strip.show();
}

// Returns a random integer between min (included) and max (excluded)
// Using Math.round() will give you a non-uniform distribution!
function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
};

function random_burst(delay) { //-RANDOM INDEX/COLOR
	var intervalIndex = setInterval(function(){
		var idex = getRandomInt(0,strip_length);
		var ihue = getRandomInt(0,359);
		var isat = getRandomInt(25,75);
		var ilum = getRandomInt(0,75);

		var color1 = Color().hsl(ihue, isat, ilum);
		strip.pixel(idex).color(color1.rgb().color);
		strip.show();
	}, delay);
	return intervalIndex;
};



function police_lights(delay) { //-POLICE LIGHTS (TWO COLOR SOLID)
	var idex = 0;
	var intervalIndex = setInterval(function(){
		idex++;
		if (idex >= strip_length) {idex = 0;}
		var idexR = idex;
		var idexB = idex + Math.floor(strip_length/2);
		if (idexB >= strip_length) {idexB-=strip_length;}
		strip.pixel(idexR).color([255,0,0]);
		strip.pixel(idexB).color([0,0,255]);
		strip.show();
	}, delay);
	return intervalIndex;
};



function flicker(delay) {
	var thishue = 0;
	var thissat = 100;
	var intervalIndex = setInterval(function(){

		var random_bright = getRandomInt(0,150);
		var random_delay = getRandomInt(10,100);
		var random_bool = getRandomInt(0,random_bright);

		if (random_bool < 10) {
			var color1 = Color().hsl(thishue, thissat, random_bright);
			strip.color(color1.rgb().color);
		}
		strip.show();
	}, delay);
	return intervalIndex;
}

function analog_input_brightness(delay) {
	var thishue = 0;
	var thissat = 100;
	var intervalIndex = setInterval(function(){
		var bright = Math.floor(analog0 * 101 / 1024);
		var color1 = Color().hsl(thishue, thissat, bright);
		strip.color(color1.rgb().color);
		strip.show();
	}, delay);
	return intervalIndex;
}

function analog_input_level(delay) {
	var thishue = 0;
	var thissat = 100;
	var thisbright = 50;
	var intervalIndex = setInterval(function(){
		var pixel_num = Math.floor(analog0 * strip_length / 1024);
		var color1 = Color().hsl(thishue, thissat, thisbright);
		strip.off();
		for(var i=0; i<pixel_num; ++i) {
			strip.pixel(i).color(color1.rgb().color);
		}
		strip.show();
	}, delay);
	return intervalIndex;
}

function device_orientation(delay) {
	return null;
}

function sound_volume(delay) {
	return null;
}

function sound_frequency(delay) {
	return null;
}


function StopStripIntervals() {
	console.log("stopping intervals");
	for (var s in strip_intervals) {
		console.log("stopping interval: " + strip_intervals[s]);
		clearInterval(strip_intervals[s]);
	}
	strip_intervals = [];
}

function BlankStrip() {
	StopStripIntervals();
	console.log("clearing strip");
	setTimeout(function(){
		strip.off(); // blanks it out
		strip.show();
	}, 500);
}

// Input a value 0 to 255 to get a color value.
// The colors are a transition r - g - b - back to r.
// Then it keeps cyling.
function colorWheel( WheelPos, level ){
	//default values
	level = typeof level !== 'undefined' ? level : 1;

	var r,g,b;
	WheelPos = 255 - (WheelPos & 255);

	if ( WheelPos < 85 ) {
		r = 255 - WheelPos * 3;
		g = 0;
		b = WheelPos * 3;
	} else if (WheelPos < 170) {
		WheelPos -= 85;
		r = 0;
		g = WheelPos * 3;
		b = 255 - WheelPos * 3;
	} else {
		WheelPos -= 170;
		r = WheelPos * 3;
		g = 255 - WheelPos * 3;
		b = 0;
	}
	// returns a string with the rgb value to be used as the parameter
	return "rgb(" + parseInt(r*level) +"," + parseInt(g*level) + "," + parseInt(b*level) + ")";
}


function indexOfMax(arr) {
    if (arr.length === 0) {
        return -1;
    }

    var max = arr[0];
    var maxIndex = 0;

    for (var i = 1; i < arr.length; i++) {
        if (arr[i] > max) {
            maxIndex = i;
            max = arr[i];
        }
    }

    return maxIndex;
}

function arraySum(arr) {
	if (arr.length === 0) {
        return 0;
    }

	var sum = 0.0;
	for (var i = 1; i < arr.length; i++) {
        sum = sum + arr[i];
    }
	return sum;
}
