/*
 Copyright 2016 Google, Inc.

 Licensed to the Apache Software Foundation (ASF) under one or more contributor
 license agreements. See the NOTICE file distributed with this work for
 additional information regarding copyright ownership. The ASF licenses this
 file to you under the Apache License, Version 2.0 (the "License"); you may not
 use this file except in compliance with the License. You may obtain a copy of
 the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 License for the specific language governing permissions and limitations under
 the License.
 */

'use strict';

var express = require('express');
var router = express.Router();
var models = require('./models');
var Sequelize = require('sequelize');
var google = require('googleapis');
var CLIENT_ID = "64390137417-75rudtdvrii7l4val0c3dkt6bsabrcsj.apps.googleusercontent.com";
var CLIENT_SECRET = "1OSFZTicWvhs2T67CDqh-KTH";
var REDIRECT_URL = "http://devbox.example.com:3000/oauth2callback";
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
var auth;
// TODO: Show spreadsheets on the main page.
router.get('/', function (req, res, next) {
    var options = {
        order: [['id', 'DESC']],
        limit:4
    };

    var toDoOptions = {
        order: [['id', 'DESC']],
        limit:10
    };

    Sequelize.Promise.all([
        models.Feedback.findAll(options),
        models.Spreadsheet.findAll(options),
        models.ToDo.findAll(toDoOptions)
    ]).then(function (results) {
        res.render('index', {
            feedbacks: results[0],
            spreadsheets: results[1],
            todos: results[2]
        });
    });
});

// generate token by auth_code
router.get('/oauth2callback', function (req,res) {
    console.log(req.toString());
    var auth_code=req.query.code;
    console.log(auth_code);
    oauth2Client.getToken(auth_code, function(err, tokens){
        if (err) {
            console.log(err);
            return res.redirect('/');
        }
        console.log(tokens);
        oauth2Client.setCredentials(tokens);
        return res.redirect('/');
        //callback();
        //TODO: write tokens info into db
    });
})

router.get('/create', function (req, res, next) {
    res.render('upsert');
});

router.get('/edit/:id', function (req, res, next) {
    models.Feedback.findById(req.params.id).then(function (feedback) {
        if (feedback) {
            res.render('upsert', {
                Feedback: feedback
            });
        } else {
            next(new Error('Feedback not found: ' + req.params.id));
        }
    });
});

router.get('/delete/:id', function (req, res, next) {
    models.Feedback.findById(req.params.id)
        .then(function (feedback) {
            if (!feedback) {
                throw new Error('Feedback not found: ' + req.params.id);
            }
            return feedback.destroy();
        })
        .then(function () {
            res.redirect('/');
        }, function (err) {
            next(err);
        });
});
//Remove spreadsheet from database
router.get('/spreadsheets/:id/remove', function (req, res, next) {
    models.Spreadsheet.findById(req.params.id)
        .then(function (spreadsheet) {
            if (!spreadsheet) {
                throw new Error('Spreadsheet:'+req.params.id+ ' not found: ');
            }
            return spreadsheet.destroy();
        })
        .then(function () {
            res.redirect('/');
        }, function (err) {
            next(err);
        });
});

router.get('/spreadsheets/:id/update/name/:newname',function(req,res,next){
    var newName=req.params.newname;
    models.Spreadsheet.findById(req.params.id)
        .then(function(spreadsheet){
            if(!spreadsheet){
                throw new Error('Spreadsheet:'+req.params.id+ ' not found: ');
            }
            spreadsheet.updateAttributes({
                    name:newName
            });
        })
});

router.post('/upsert', function (req, res, next) {
    models.Feedback.upsert(req.body).then(function () {
        console.log(req.body);
        res.redirect('/');
    }, function (err) {
        next(err);
    });
});

//upsert feedback and sync to google sheet
router.post('/upsert/:id/autosync', function (req, res, next) {
    var is_recorded=false;
    var is_synced=false;
    models.Feedback.upsert(req.body).then(function () {
        is_recorded=true;
        if (!auth) {
            return next(Error('Authorization required.'));
        }
        var spreadsheet;
        var feedbacks;
        var accessToken = auth.split(' ')[1];
        var helper = new SheetsHelper(accessToken);

        Sequelize.Promise.all([
            models.Spreadsheet.findById(req.params.id),
            models.Feedback.findAll()
        ]).then(function (results) {
            spreadsheet = results[0];
            feedbacks = results[1];
            helper.sync(spreadsheet.id, spreadsheet.sheetId, feedbacks, function (err) {
                if (err) {
                    return next(err);
                }else{
                    is_synced=true;
                }
                return res.json({is_recorded:is_recorded,is_synced:is_synced});
            });
        });

    }, function (err) {
        next(err);
    });
});

router.post('/upsert/unknown', function(req, res, next){
    var raw = req.body;
    models.ToDo.upsert(Object.assign({}, {rawData: escape(req.body.rawData)})).then(()=>{
        
    }, (error)=>{
        next(error);
    });
})


router.post('/report/upsert/spreadsheets/:id/sync',function(req,res,next){
    var is_recorded=false;
    var is_synced=false;
    models.Report.upsert(req.body).then(function () {
        is_recorded=true;
        if (!auth) {
            return next(Error('Authorization required.'));
        }
        var spreadsheet;
        var reports;
        var accessToken = auth.split(' ')[1];
        var helper = new SheetsHelper(accessToken);

        Sequelize.Promise.all([
            models.Spreadsheet.findById(req.params.id),
            models.Report.findAll()
        ]).then(function (results) {
            spreadsheet = results[0];
            reports = results[1];
            helper.syncReport(spreadsheet.id, spreadsheet.sheetId, reports, function (err) {
                if (err) {
                    return next(err);
                }else{
                    is_synced=true;
                }
                return res.json({is_recorded:is_recorded,is_synced:is_synced});
            });
        });

    }, function (err) {
        next(err);
    });
})

// TODO: Add route for creating spreadsheet.
var SheetsHelper = require('./sheets');

router.post('/spreadsheets', function (req, res, next) {
    auth = req.get('Authorization');
    if (!auth) {
        return next(Error('Authorization required.'));
    }
    var accessToken = auth.split(' ')[1];
    var helper = new SheetsHelper(accessToken);
    var title = 'Feedback (' + new Date().toLocaleTimeString() + ')';
    helper.createSpreadsheet(title, function (err, spreadsheet) {
        if (err) {
            return next(err);
        }
        var model = {
            id: spreadsheet.spreadsheetId,
            sheetId: spreadsheet.sheets[0].properties.sheetId,
            name: spreadsheet.properties.title
        };
        models.Spreadsheet.create(model).then(function () {
            return res.json(model);
        });
    });
});

// TODO: Add route for syncing spreadsheet.
router.post('/spreadsheets/:id/sync', function (req, res, next) {
    auth = req.get('Authorization');
    var spreadsheet;
    var feedbacks;
    if (!auth) {
        return next(Error('Authorization required.'));
    }
    var accessToken = auth.split(' ')[1];
    var helper = new SheetsHelper(accessToken);
    Sequelize.Promise.all([
        models.Spreadsheet.findById(req.params.id),
        models.Feedback.findAll()
    ]).then(function (results) {
        spreadsheet = results[0];
        feedbacks = results[1];
        helper.sync(spreadsheet.id, spreadsheet.sheetId, feedbacks, function (err) {
            if (err) {
                return next(err);
            }
            return res.json(feedbacks.length);
        });
    });
});



module.exports = router;
