"use strict";


module.exports = function(sequelize, DataTypes) {
    var ToDO = sequelize.define('ToDo', {
        rawData: {type: DataTypes.STRING, allowNull: false},
        
    });

    return ToDO;
};