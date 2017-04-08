"use strict";


module.exports = function(sequelize, DataTypes) {
    var ToDO = sequelize.define('ToDo', {
        id: {type: DataTypes.STRING, allowNull: false, primaryKey: true},
        rawData: {type: DataTypes.STRING, allowNull: false},
    });

    return ToDO;
};