'use strict';

const express = require('express');
const fs = require("fs");

const app = express();
const router = express.Router();

const parseArgs = () => {
	const args = {};
	const rawArgs = process.argv.slice(2);
	let tmpArg = '';

	rawArgs.forEach((arg) => {
		tmpArg = arg.split('=');
		args[tmpArg[0].replace(/^-+/,'')] = tmpArg[1];
	});

	return args;
};

const args = parseArgs();
const host = args.host || 'http://localhost';
const port = args.port || 3030;
const public_response = ".";
const url  =  [host, port].join(':');

router.get('/', function (req, res) {
  const { msg } = req.query;
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET,PUT");
  res.header('Access-Control-Allow-Credentials', 'true');

  res.status(200).send(msg || 'foo');
});

router.get('/:bar', function (req, res) {
  const { bar } = req.params;
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET,PUT");
  res.header('Access-Control-Allow-Credentials', 'true');

  // res.status(200).send('foo');
  res.status(200).json({data: bar});
});

router.post('/:foo', function (req, res) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

	const { foo } = req.params;

	if (foo === 'bar') {
    res.status(200).json({success: "true"});
  } else if (foo === 'etc') {
    res.status(401).json({ "code": 99, "message": "Unexpected error" });
	} else {
		res.status(503).send();
	}
});

app.use(router);

app.listen(port, function () {
	console.log('Server running at', url);
});
