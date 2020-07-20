var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const bodyparser = require("body-parser");
const express = require("express")();
const nodeFetch = require("node-fetch");
const emailConfig = {
    auth: {
        user: "magnecordev@gmail.com",
        pass: "aPassword123"
    },
    service: "gmail"
};
const nodeMailer = require("nodemailer").createTransport(emailConfig);
const sqlConfig = {
    authentication: {
        type: "default",
        options: {
            userName: "magnecordev_SQLLogin_1",
            password: "if29m6b9r7"
        }
    },
    options: {
        database: "magnecor",
        encrypt: true,
        rowCollectionOnRequestCompletion: true
    },
    server: "magnecor.mssql.somee.com"
};
const tedious = require("tedious");
const connection = new tedious.Connection(sqlConfig);
connection.on("connect", error => console.log((error || "signed into SQL database")));
const sqlRequest = tedious.Request;
const TYPES = tedious.TYPES;
const encodeSQLParameter = (parameter) => {
    if (Array.isArray(parameter))
        parameter = (parameter.length ? parameter.join(",") : null);
    if (parameter === null)
        return "NULL";
    switch (typeof parameter) {
        case "boolean":
            return String(parameter | 0);
        case "string":
            return `'${parameter}'`;
        default:
            return String(parameter);
    }
};
const generateHTMLFromNestedArray = (array) => {
    let tempStr = `<table border="1">`;
    for (let i = 0; (i < array.length); i++) {
        let row = array[i];
        if (i) {
            if (i == 1)
                tempStr += "<tbody>";
            tempStr += `<tr>${row.map(column => `<td>${column}</td>`).join("")}</tr>`;
        }
        else
            tempStr += `<thead><tr>${row.map(column => `<th>${column}</th>`).join("")}</tr></thead>`;
    }
    if (array.length > 1)
        tempStr += "</tbody>";
    return (tempStr += "</table>");
};
const mapObjectArray = (rows) => {
    return rows.map(row => {
        let tempObj = {};
        for (let column of row)
            tempObj[column.metadata.colName] = column.value;
        return tempObj;
    });
};
const prefixOrderID = (index = 0, iterations = 2) => {
    let returnedString = "";
    if (iterations) {
        let i = 0;
        while (index) {
            let charCode = (Math.floor(index / Math.pow(36, (iterations - ++i))) + 65);
            returnedString += String.fromCharCode(charCode - ((charCode < 75) ? 17 : 10)).toLocaleUpperCase();
            index -= ((charCode === 65) ? 0 : ((index - (index % 36)) || index));
        }
        while (iterations !== returnedString.length)
            returnedString += "0";
    }
    return returnedString;
};
const transformBoolean = (boolean) => (boolean ? "Yes" : "No");
let sqlCache = {
    queries: {},
    queryCount: 0
};
class DBO {
    constructor() {
        this._arrayKeys = [];
        this._command = (command, isParsed = true) => new Promise((resolve, reject) => {
            console.log(command);
            connection.execSql(new sqlRequest(`${command}`, (error, rowCount, rows) => (error ? reject(error) : resolve((rows ?
                (isParsed ? mapObjectArray(rows) : rows) : null)))));
        });
        this._count = (command) => this._read(null, (command || `SELECT COUNT(*) FROM ${this._dbName}`), true, true, false);
        this._create = (entity) => this._saveDeclaredEntities(entity).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
            let entityID = 0;
            let tempArr = [];
            yield this._count(`SELECT MAX(ID) FROM ${this._dbName}`).then(count => (entityID = ++count)).catch(error => { throw error; });
            for (let column of sqlColumns)
                tempArr.push((column === "ID") ? entityID : encodeSQLParameter(entity[column]));
            return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`)
                .then(() => entityID);
        })));
        this.createdDate = null;
        this._dbName = null;
        this._delete = (data) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (typeof data !== "object")
                yield this._read(data).then(entity => (data = entity)).catch(error => reject(error));
            let entity = data;
            entity.isDelete = true;
            yield this._saveDeclaredEntities(entity).catch(error => reject(error));
            resolve(this._command(`DELETE FROM ${this._dbName} WHERE ID = ${encodeSQLParameter(entity.ID)}`).then(() => 0));
        }));
        this.ID = 0;
        this.instantiate = (isExternal = false) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let properties = [];
            if (isExternal)
                yield this._readSQLColumns().then(columns => (properties = columns)).catch(error => reject(error));
            else
                properties = Object.keys(this).filter(key => !key.startsWith("_")); //make this recursive (internal)
            let tempObj = {};
            for (let property of properties)
                tempObj[property] = this[property];
            resolve(tempObj);
        }));
        this.isDelete = false;
        this._mappedEntities = [];
        this._read = (ID, command, isFirstRow = false, isFirstColumn = false, isEagerLoading = true) => {
            sqlCache.queryCount++;
            let cachedResult = sqlCache.queries[(command = (command || `SELECT * FROM ${this._dbName}${(ID ? ` WHERE ID = ${encodeSQLParameter(ID)}` : "")}`))];
            return (cachedResult ? Promise.resolve(JSON.parse(cachedResult)) : this._command(command)).then((rows) => __awaiter(this, void 0, void 0, function* () {
                if (!cachedResult)
                    sqlCache.queries[command] = JSON.stringify(rows);
                rows = ((isFirstRow || !!ID) ? (rows.length ? rows[0] : null) : rows);
                if (rows) {
                    if (isEagerLoading)
                        yield this._readDeclaredEntities((Array.isArray(rows) ? rows : [rows])).catch(error => { throw error; });
                    if (isFirstColumn)
                        rows = (Array.isArray(rows) ? rows.map(row => row[""]) : rows[""]);
                }
                return rows;
            })).finally(() => {
                if (!--sqlCache.queryCount)
                    sqlCache.queries = {};
            });
        };
        this._readDeclaredEntities = (rows) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            for (let row of rows) {
                for (let arrayKey of this._arrayKeys) {
                    let value = row[arrayKey];
                    row[arrayKey] = (value ? value.split(",") : []);
                }
                for (let mappedEntity of this._mappedEntities) {
                    let property = {
                        name: mappedEntity.property,
                        truncatedName: mappedEntity.property.slice(0, (mappedEntity.property.length - 1))
                    };
                    if (mappedEntity.isArray) {
                        let entityArr = [];
                        let entityIDs = (row[`${property.truncatedName}IDs`] = (row[`${property.truncatedName}IDs`] ?
                            row[`${property.truncatedName}IDs`].split(",") : []));
                        if (entityIDs) {
                            for (let entityID of entityIDs)
                                yield new mappedEntity.class()._read(entityID).then(returnedEntity => entityArr.push(returnedEntity)).catch(error => reject(error));
                            row[property.name] = entityArr;
                        }
                        else
                            row[property.name] = [];
                    }
                    else {
                        let entityID = row[`${property.name}ID`];
                        if (entityID)
                            yield new mappedEntity.class()._read(entityID).then(returnedEntity => (row[property.name] = returnedEntity)).catch(error => reject(error));
                        else
                            row[property.name] = null;
                    }
                }
            }
            resolve();
        }));
        this._readProperty = (property, value, isFirstRow = true, isEagerLoading = true) => this._read(null, `SELECT * FROM ${this._dbName} WHERE ${property} = ${encodeSQLParameter(value)}`, isFirstRow, false, isEagerLoading);
        this._readSQLColumns = () => this._command(`SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'${this._dbName}'`)
            .then(rows => rows.map(row => row.COLUMN_NAME));
        this._save = (entity) => (entity.ID ? (entity.isDelete ? this._delete(entity) : this._update(entity)) : this._create(entity));
        this._saveDeclaredEntities = (entity) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            for (let arrayKey of this._arrayKeys) {
                let value = entity[arrayKey];
                entity[arrayKey] = (value ? (Array.isArray(value) ? value.join(",") : value) : null);
            }
            for (let mappedEntity of this._mappedEntities) {
                if (!mappedEntity.isFrozen) {
                    let property = mappedEntity.property;
                    if (mappedEntity.isArray) {
                        let entityIDs = [];
                        let enumerableProperty = `${property.slice(0, (property.length - 1))}IDs`;
                        for (let i = 0; (i < entity[property].length); i++) {
                            let pendingEntity = entity[property][i];
                            if (!((pendingEntity.isDelete = entity.isDelete) && !pendingEntity.ID)) {
                                yield new mappedEntity.class()._save(pendingEntity).then(entityID => {
                                    if (!pendingEntity.isDelete)
                                        entityIDs.push(entityID);
                                }).catch(error => reject(error));
                            }
                        }
                        entity[enumerableProperty] = (entityIDs.join(",") || null);
                    }
                    else {
                        let pendingEntity = entity[property];
                        if (!((pendingEntity.isDelete = entity.isDelete) && !pendingEntity.ID))
                            yield new mappedEntity.class()._save(pendingEntity).then(entityID => (entity[`${property}ID`] = entityID)).catch(error => reject(error));
                    }
                }
            }
            resolve();
        }));
        this._update = (entity) => this._saveDeclaredEntities(entity).then(() => __awaiter(this, void 0, void 0, function* () {
            return this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
                let tempArr = [];
                for (let column of sqlColumns)
                    tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(entity[column]))}`);
                return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${encodeSQLParameter(entity.ID)}`).then(() => entity.ID);
            }));
        }));
        this.updatedDate = null;
    }
}
class Address extends DBO {
    constructor() {
        super(...arguments);
        this.city = null;
        this._create = (address) => this._readAddressMatches(address).then((addressMatch) => __awaiter(this, void 0, void 0, function* () {
            if (addressMatch)
                return addressMatch.ID;
            else
                return this._saveDeclaredEntities(address).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
                    let addressID = 0;
                    let tempArr = [];
                    yield this._count(`SELECT MAX(ID) FROM Addresses`).then(count => (addressID = ++count)).catch(error => { throw error; });
                    for (let column of sqlColumns)
                        tempArr.push((column === "ID") ? addressID : encodeSQLParameter(address[column]));
                    return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`)
                        .then(() => addressID);
                })));
        }));
        this._delete = (data) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (typeof data !== "object")
                yield this._read(data).then(returnedAddress => (data = returnedAddress)).catch(error => reject(error));
            let address = data;
            resolve(this._readEntityDependencies(address).then((count) => __awaiter(this, void 0, void 0, function* () {
                if (count < 2) {
                    address.isDelete = true;
                    yield this._saveDeclaredEntities(address).catch(error => { throw error; });
                    yield this._command(`DELETE FROM ${this._dbName} WHERE ID = ${address.ID}`).catch(error => { throw error; });
                }
                return 0;
            })));
        }));
        this._dbName = "Addresses";
        this.ID = 0;
        this.street = null;
        this.stateID = 0;
        this._readAddressMatches = (address, isFirstRow = true) => this._read(null, `SELECT * FROM Addresses WHERE CITY =\
     ${encodeSQLParameter(address.city)} AND STATEID = ${encodeSQLParameter(address.stateID)} AND STREET = ${encodeSQLParameter(address.street)}`, isFirstRow);
        this._readEntityDependencies = (address) => {
            let sqlSubstring = `WHERE ADDRESSID = ${encodeSQLParameter(address.ID)}`;
            //.join() with " UNION ALL " :D
            return this._count(`SELECT COUNT(*) FROM (SELECT ID FROM Orders ${sqlSubstring} UNION ALL SELECT ID FROM Users ${sqlSubstring}) AS S`);
        };
        this._update = (address) => this._readEntityDependencies(address).then(count => {
            if (count > 1)
                return this._create(address);
            else
                return this._readAddressMatches(address).then((addressMatch) => __awaiter(this, void 0, void 0, function* () {
                    if (addressMatch && (address.ID !== addressMatch.ID))
                        return this._delete(address).then(() => addressMatch.ID);
                    return this._saveDeclaredEntities(address).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
                        let tempArr = [];
                        for (let column of sqlColumns)
                            tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(address[column]))}`);
                        return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${address.ID}`).then(() => address.ID);
                    })));
                }));
        });
        this.zipCode = null;
    }
}
class Boot extends DBO {
    constructor() {
        super(...arguments);
        this.angle = 0;
        this.bootName = null;
        this.code = null;
        this.cost = 0;
        this._mappedEntities = [{ class: Terminal, isFrozen: true, property: "terminal" }];
        this.terminal = new Terminal;
        this.terminalID = 0;
        this.wireStartRatio = 0;
    }
}
class CableType extends DBO {
    constructor() {
        super(...arguments);
        this.cableTypeName = null;
        this.code = null;
        this.color = null;
        this.cost = 0;
        this._dbName = "CableTypes";
        this.diameter = 0;
    }
}
class CoilBoot extends Boot {
    constructor() {
        super(...arguments);
        this._dbName = "CoilBoots";
    }
}
class Cable extends DBO {
    constructor() {
        super(...arguments);
        this.cableLength = 0;
        this.coilBootID = 0;
        this.plugBootID = 0;
    }
}
class CoilCable extends Cable {
    constructor() {
        super(...arguments);
        this._dbName = "CoilCables";
    }
}
class CoilCableCoilBootMapping extends DBO {
    constructor() {
        super(...arguments);
        this._arrayKeys = ["coilBootIDs"];
        this.coilBootIDs = [];
        this.coilPackTypeID = 0;
        this._dbName = "CoilCableCoilBootMappings";
    }
}
class CoilCablePlugBootIDs extends DBO {
    constructor() {
        super(...arguments);
        this._arrayKeys = ["plugBootIDs"];
        this._dbName = "CoilCablePlugBootIDs";
        this.plugBootIDs = [];
    }
}
class CoilPackType extends DBO {
    constructor() {
        super(...arguments);
        this.coilPackName = null;
        this.isMeasureUIVisible = false;
        this._dbName = "CoilPackTypes";
    }
}
class Dealer extends DBO {
    constructor() {
        super(...arguments);
        this.backgroundColor = null;
        this.costRatio = 0;
        this._dbName = "Dealers";
        this.dealerName = null;
        this.emailAddress = null;
        this.foregroundColor = null;
        this.hostname = null;
        this.isActive = false;
        this.logoURI = null;
        this._readHostname = (hostname) => this._read(null, `SELECT * FROM Dealers WHERE HOSTNAME LIKE '${hostname}%'`, true, false, false)
            .then(data => {
            if (data)
                return data;
            else
                throw "No hosting dealer match was found.";
        });
    }
}
class EngineType extends DBO {
    constructor() {
        super(...arguments);
        this._dbName = "EngineTypes";
        this.engineTypeName = null;
    }
}
class OrderStatus extends DBO {
    constructor() {
        super(...arguments);
        this._dbName = "OrderStatuses";
        this.statusName = null;
    }
}
class PlugBoot extends Boot {
    constructor() {
        super(...arguments);
        this._dbName = "PlugBoots";
    }
}
class PlugCable extends Cable {
    constructor() {
        super(...arguments);
        this._dbName = "PlugCables";
    }
}
class State extends DBO {
    constructor() {
        super(...arguments);
        this.stateCode = null;
        this.stateName = null;
        this._dbName = "States";
    }
}
class Terminal extends DBO {
    constructor() {
        super(...arguments);
        this.code = null;
        this.cost = 0;
        this._dbName = "Terminals";
        this.terminalName = null;
    }
}
class User extends DBO {
    constructor() {
        super(...arguments);
        this.address = new Address();
        this.addressID = 0;
        this._authenticate = (UID, decryptionKey, cipherText) => this._read(null, `SELECT CONVERT (NVARCHAR(MAX),\
     DECRYPTBYPASSPHRASE(N'${decryptionKey}', CONVERT(VARBINARY(MAX), ${(cipherText || `(SELECT CURRENTPASSWORD FROM USERS WHERE ${((typeof UID === "string") ?
            "USERNAME" : "ID")} = ${encodeSQLParameter(UID)})`)}, 1)))`, true, true, false).then(password => {
            if (password)
                return password;
            else
                throw "An incorrect password was provided.";
        });
        this._create = (user) => this._readUserMatches(user).then(() => this._encryptPassphrase(user.currentPassword).then(cipherText => this._saveDeclaredEntities(user).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
            let entityID = 0;
            let tempArr = [];
            yield this._count(`SELECT MAX(ID) FROM Users`).then(count => (entityID = ++count)).catch(error => { throw error; });
            for (let column of sqlColumns)
                tempArr.push(((column === "ID") ? entityID : encodeSQLParameter(((column === "currentPassword") ? cipherText : user[column]))));
            return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`)
                .then(() => entityID);
        })))));
        this.currentPassword = null;
        this._dbName = "Users";
        this._delete = (data) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (typeof data !== "object")
                yield this._read(data).then(entity => (data = entity)).catch(error => reject(error));
            let user = data;
            user.isActive = !(user.isDelete = true);
            resolve(this._authenticate(user.ID, user.previousPassword).then(() => this._update(user)));
        }));
        this.emailAddress = null;
        this._encryptPassphrase = (cleartext, passphrase) => this._command(`SELECT CONVERT(VARCHAR(MAX),\
     ENCRYPTBYPASSPHRASE(N'${(passphrase || cleartext)}', N'${cleartext}'), 1)`).then(data => String(data[0][""]));
        this.firstName = null;
        this.ID = 0;
        this.isActive = true;
        this._mappedEntities = [{ class: Address, property: "address" }];
        this.lastName = null;
        this.phoneNumber = null;
        this._readUserMatches = (user) => this._readProperty("EMAILADDRESS", user.emailAddress).then(matchedUser => {
            let userID = (matchedUser ? matchedUser.ID : 0);
            if (userID && (user.ID !== userID))
                throw "An account already exists with the same email address.";
            else
                return this._readProperty("USERNAME", user.username).then(matchedUser => {
                    userID = (matchedUser ? matchedUser.ID : 0);
                    if (userID && (user.ID !== userID))
                        throw "An account already exists with same username.";
                });
        });
        this._update = (user) => this._authenticate(user.ID, user.previousPassword).then(() => this._readUserMatches(user).then(() => this._encryptPassphrase(user.currentPassword || user.previousPassword).then(cipherText => {
            return this._saveDeclaredEntities(user).then(() => __awaiter(this, void 0, void 0, function* () {
                return this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
                    let tempArr = [];
                    for (let column of sqlColumns)
                        tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(((column === "currentPassword") ? cipherText :
                            user[column])))}`);
                    return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${encodeSQLParameter(user.ID)}`).then(() => user.ID);
                }));
            }));
        })));
        this.username = null;
    }
}
class Vehicle extends DBO {
    constructor() {
        super(...arguments);
        this._create = (vehicle) => this._readVehicleMatches(vehicle).then((vehicleMatch) => __awaiter(this, void 0, void 0, function* () {
            if (vehicleMatch)
                return vehicleMatch.ID;
            else
                return this._saveDeclaredEntities(vehicle).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
                    let tempArr = [];
                    let vehicleID = 0;
                    yield this._count(`SELECT MAX(ID) FROM Vehicles`).then(count => (vehicleID = ++count)).catch(error => { throw error; });
                    for (let column of sqlColumns)
                        tempArr.push((column === "ID") ? vehicleID : encodeSQLParameter(vehicle[column]));
                    return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`).then(() => vehicleID);
                })));
        }));
        this._dbName = "Vehicles";
        this._delete = (data) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (typeof data !== "object")
                yield this._read(data).then(returnedVehicle => (data = returnedVehicle)).catch(error => reject(error));
            let vehicle = data;
            resolve(this._readEntityDependencies(vehicle).then((count) => __awaiter(this, void 0, void 0, function* () {
                if (count < 2) {
                    vehicle.isDelete = true;
                    // await this._deleteMappedEntities(vehicle).catch(error => {throw error})
                    yield this._saveDeclaredEntities(vehicle).catch(error => { throw error; });
                    yield this._command(`DELETE FROM ${this._dbName} WHERE ID = ${encodeSQLParameter(vehicle.ID)}`).catch(error => { throw error; });
                }
                return 0;
            })));
        }));
        this.make = null;
        this.model = null;
        this._readVehicleMatches = (vehicle, isFirstRow = true) => this._read(null, `SELECT * FROM Vehicles WHERE MAKE =\
     ${encodeSQLParameter(vehicle.make)} AND MODEL = ${encodeSQLParameter(vehicle.model)} AND YEAR = ${encodeSQLParameter(vehicle.year)}`, isFirstRow, false, false);
        this._readEntityDependencies = (vehicle) => this._count(`SELECT COUNT(*) FROM Orders WHERE VEHICLEID = ${encodeSQLParameter(vehicle.ID)}`);
        this._update = (vehicle) => this._readEntityDependencies(vehicle).then(count => {
            if (count > 1)
                return this._create(vehicle);
            else
                return this._readVehicleMatches(vehicle).then((vehicleMatch) => __awaiter(this, void 0, void 0, function* () {
                    if (vehicleMatch && (vehicle.ID !== vehicleMatch.ID))
                        return this._delete(vehicle).then(() => vehicleMatch.ID);
                    return this._saveDeclaredEntities(vehicle).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
                        let tempArr = [];
                        for (let column of sqlColumns)
                            tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(vehicle[column]))}`);
                        return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${vehicle.ID}`).then(() => vehicle.ID);
                    })));
                }));
        });
        this.year = 0;
    }
}
class Order extends DBO {
    constructor() {
        super(...arguments);
        this.address = new Address();
        this.addressID = 0;
        this.cableTypeID = 0;
        this.cavityDepth = 0;
        this._create = (order) => this._saveDeclaredEntities(order).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
            let dealerPrefix = prefixOrderID(order.dealerID);
            let GUID = null;
            let orderID = null;
            let tempArr = [];
            yield this._count(`SELECT COUNT(*) FROM Orders WHERE ID LIKE '${dealerPrefix}%'`).then(count => (orderID = `${dealerPrefix}${String(new Date()
                .getFullYear()).slice(2, 4)}${((0).toFixed(4) + ++count).slice(-4)}`)).catch(error => { throw error; });
            yield this._read(null, `SELECT CONVERT(varchar(36), NEWID())`, true, true, false).then(data => (GUID = data)).catch(error => { throw error; });
            yield this._calculatePrices(GUID, orderID, order).catch(error => { throw error; });
            for (let column of sqlColumns)
                tempArr.push(encodeSQLParameter((column === "ID") ? orderID : ((column === "GUID") ? GUID : order[column])));
            return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`).then(() => orderID);
        })));
        this.coilCableIDs = [];
        this.coilCables = [];
        this.coilPackTypeID = 0;
        this.coilTowerOuterDiameter = 0;
        this.cost = 0;
        this.cylinderCount = 0;
        this.dealerID = 0;
        this.dealerPrice = 0;
        this._dbName = "Orders";
        this._calculatePrices = (GUID, orderID, order) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let coilBoots = {};
            let plugBoots = {};
            let cableTypes = {};
            let coilPackTypes = {};
            let cost = 0;
            let dealer = null;
            let states = {};
            yield new CoilBoot()._read().then(data => data.forEach(boot => coilBoots[boot.ID] = boot)).catch(error => reject(error));
            yield new PlugBoot()._read().then(data => data.forEach(boot => plugBoots[boot.ID] = boot)).catch(error => reject(error));
            yield new CableType()._read().then(data => data.forEach(cableType => cableTypes[cableType.ID] = cableType)).catch(error => reject(error));
            yield new CoilPackType()._read().then(data => data.forEach(coilPackType => coilPackTypes[coilPackType.ID] = coilPackType))
                .catch(error => reject(error));
            yield new Dealer()._read(order.dealerID).then(data => (dealer = data)).catch(error => reject(error));
            yield new State()._read().then(data => data.forEach(state => states[state.ID] = state)).catch(error => reject(error));
            let plugCables = order.plugCables.filter(plugCable => !plugCable.isDelete);
            let coilCables = order.coilCables.filter(coilCable => !coilCable.isDelete);
            for (let plugCable of plugCables) {
                let coilBoot = coilBoots[plugCable.coilBootID];
                let plugBoot = plugBoots[plugCable.plugBootID];
                cost += ((coilBoot ? (coilBoot.cost + coilBoot.terminal.cost) : 0) + (plugBoot ? (plugBoot.cost + plugBoot.terminal.cost) : 0) + (plugCable.cableLength *
                    cableTypes[order.cableTypeID].cost));
            }
            for (let coilCable of coilCables) {
                let coilBoot = coilBoots[coilCable.coilBootID];
                let plugBoot = plugBoots[coilCable.plugBootID];
                cost += ((coilBoot ? (coilBoot.cost + coilBoot.terminal.cost) : 0) + (plugBoot ? (plugBoot.cost + plugBoot.terminal.cost) : 0) + (coilCable.cableLength *
                    cableTypes[order.cableTypeID].cost));
            }
            let laborPrice = 0;
            if (order.cylinderCount <= 5)
                laborPrice = 21;
            else if ((order.cylinderCount > 5) && (order.cylinderCount < 8))
                laborPrice = 42;
            else if (order.cylinderCount == 8)
                laborPrice = 63;
            else
                laborPrice = 84;
            //where the heck are costs...?
            let numberedPrice = ((order.isNumbered | 0) * order.cylinderCount * (coilCables.length + plugCables.length));
            let retailPrice = ((cost * 2.85) + laborPrice + numberedPrice);
            // let retailPrice: number = (cost / 0.2)
            // let change: number = Number("0." + retailPrice.toFixed(13).split(".")[1])
            // retailPrice = Math.trunc(retailPrice)
            // retailPrice = (((retailPrice % 2) + 1) + retailPrice)
            // let tempCost = Number(String(change).replace("0.", ""))
            // change = Number("0." + (((tempCost % 2) + 1) + tempCost))
            //retailPrice + change (below)
            order.dealerPrice = (dealer.costRatio * (order.retailPrice = retailPrice));
            if (order.statusID > 1) {
                let emailAddresses = {
                    0: "nicholasveal@hotmail.com",
                    1: dealer.emailAddress,
                    2: order.emailAddress
                };
                for (let i = 0; (i < 3); i++) {
                    let html = `<h3>Details</h3>`;
                    if (order.isDelete)
                        html += `This order has been cancelled.`;
                    else {
                        if (i === 2)
                            html += `This order has been placed with a customer price/MSRP of $${order.retailPrice.toFixed(2)}. Your estimated dealer price is
                         $${order.dealerPrice.toFixed(2)}.`;
                        else {
                            if (i)
                                html += `Your order UID is ${GUID}. Place this in the calculator search box to access/modify your order later.<br><br>`;
                            let detailArr = [["Property", "Value"].concat((i ? [] : ["Retail Price"]))];
                            detailArr.push(["Name", `${order.firstName} ${order.lastName}`], ["Address", `${order.address.street}<br>
                            ${order.address.city}, ${states[order.address.stateID].stateName} ${order.address.zipCode}`], ["Phone Number", `${order.phoneNumber}`], ["Email Address", `${order.emailAddress}`], ["Vehicle", `${order.vehicle.year} ${order.vehicle.make} ${order.vehicle.model}`]);
                            if (order.engineCode)
                                detailArr.push(["Engine Code", `${order.engineCode}`]);
                            detailArr.push(["Engine Replacement", `${transformBoolean(order.isEngineReplacement)}`]);
                            if (order.engineSize)
                                detailArr.push(["Engine Size", `${order.engineSize}`]);
                            detailArr.push(["Cylinder Count", `${order.cylinderCount}`], ["Valve Count", `${order.valveCount}`], ["SOHC/DOHC", `${(order.isDOHC ? "DOHC" : "SOHC")}`], ["Coil Pack Type", `${coilPackTypes[order.coilPackTypeID].coilPackName}`]);
                            if (coilPackTypes[order.coilPackTypeID].isMeasureUIVisible)
                                detailArr.push(["Coil Tower Outer Diameter", `${Number(order.coilTowerOuterDiameter)} inches`], ["Cavity Depth", `${Number(order.cavityDepth)} inches`]);
                            detailArr.push(["Cable Type", `${cableTypes[order.cableTypeID].cableTypeName}`], ["Numbered Cables", `${transformBoolean(order.isNumbered)}`].concat((i ? [] : [`$${numberedPrice}`])));
                            html += generateHTMLFromNestedArray(detailArr);
                            if (plugCables.length) {
                                html += `<h3>Plug Cables</h3>`;
                                let plugCableArr = [["Item"].concat((i ? [] : ["Retail Price"]))];
                                for (let cableIndex = 0; (cableIndex < plugCables.length); cableIndex++) {
                                    let plugCable = plugCables[cableIndex];
                                    let coilBoot = coilBoots[plugCable.coilBootID];
                                    let plugBoot = plugBoots[plugCable.plugBootID];
                                    plugCableArr.push([`<em>Cable ${(cableIndex + 1)}</em>`], [`${coilBoot.bootName} (${coilBoot.code})`].concat((i ? [] : [`$${(coilBoot.cost * 2.85).toFixed(2)}`])), [`${coilBoot.terminal.terminalName} (${coilBoot.terminal.code})`].concat((i ? [] : [`$${(coilBoot.terminal.cost * 2.85).toFixed(2)}`])), [`${plugCable.cableLength} inches of ${cableTypes[order.cableTypeID].cableTypeName} cable`].concat((i ? [] :
                                        [`$${((plugCable.cableLength * cableTypes[order.cableTypeID].cost * 2.85)).toFixed(2)}`])), [`${plugBoot.bootName} (${plugBoot.code})`].concat((i ? [] : [`$${(plugBoot.cost * 2.85).toFixed(2)}`])), [`${plugBoot.terminal.terminalName} (${plugBoot.terminal.code})`].concat((i ? [] : [`$${(plugBoot.terminal.cost * 2.85).toFixed(2)}`])));
                                }
                                html += generateHTMLFromNestedArray(plugCableArr);
                            }
                            if (coilCables.length) {
                                html += `<h3>Coil Cables</h3>`;
                                let coilCableArr = [["Item"].concat((i ? [] : ["Retail Price"]))];
                                for (let cableIndex = 0; (cableIndex < coilCables.length); cableIndex++) {
                                    let coilCable = coilCables[cableIndex];
                                    let coilBoot = coilBoots[coilCable.coilBootID];
                                    let plugBoot = plugBoots[coilCable.plugBootID];
                                    coilCableArr.push([`<em>Cable ${(cableIndex + 1)}</em>`], [`${coilBoot.bootName} (${coilBoot.code})`].concat((i ? [] : [`$${(coilBoot.cost * 2.85).toFixed(2)}`])), [`${coilBoot.terminal.terminalName} (${coilBoot.terminal.code})`].concat((i ? [] : [`$${(coilBoot.terminal.cost * 2.85).toFixed(2)}`])), [`${coilCable.cableLength} inches of ${cableTypes[order.cableTypeID].cableTypeName} cable`].concat((i ?
                                        [] : [`$${((coilCable.cableLength * cableTypes[order.cableTypeID].cost * 2.85)).toFixed(2)}`])), [`${plugBoot.bootName} (${plugBoot.code})`].concat((i ? [] : [`$${(plugBoot.cost * 2.85).toFixed(2)}`])), [`${plugBoot.terminal.terminalName} (${plugBoot.terminal.code})`].concat((i ? [] : [`$${(plugBoot.terminal.cost * 2.85).toFixed(2)}`])));
                                }
                                html += generateHTMLFromNestedArray(coilCableArr);
                            }
                            html += `<h3>Labor Price</h3>`;
                            html += `<div>$${laborPrice.toFixed(2)}</div>`;
                            html += `<h3><em><u>Total${(i ? "" : "s")}</u></em></h3>`;
                            if (!i)
                                html += `<div>Dealer Price: $${order.dealerPrice.toFixed(2)}</div>`;
                            html += `<div>Customer Price (estimated/MSRP): $${retailPrice.toFixed(2)}</div>`;
                        }
                        yield nodeMailer.sendMail({
                            from: "Magnecor <magnecordev@gmail.com>",
                            html: html,
                            subject: `Order #${orderID} Update`,
                            to: emailAddresses[i],
                        }, error => {
                            if (error)
                                reject(error);
                        });
                    }
                }
            }
            resolve();
        }));
        this._delete = (data) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (typeof data !== "object")
                yield this._read(data).then(entity => (data = entity)).catch(error => reject(error));
            let order = data;
            order.isDelete = true;
            yield this._calculatePrices(order.GUID, order.ID, order).catch(error => reject(error));
            yield this._saveDeclaredEntities(order).catch(error => reject(error));
            resolve(this._command(`DELETE FROM ${this._dbName} WHERE ID = ${encodeSQLParameter(order.ID)}`).then(() => null));
        }));
        this.emailAddress = null;
        this.engineCode = null;
        this.engineSize = null;
        this.engineTypeID = 0;
        this.firstName = null;
        this.GUID = null;
        this.ID = null;
        this.isDOHC = false;
        this.isNumbered = false;
        this.isEngineReplacement = false;
        this.lastName = null;
        this._mappedEntities = [
            { class: Address, property: "address" },
            { class: CoilCable, isArray: true, property: "coilCables" },
            { class: PlugCable, isArray: true, property: "plugCables" },
            { class: Vehicle, property: "vehicle" }
        ];
        this.phoneNumber = null;
        this.plugCableIDs = [];
        this.plugCables = [];
        this.retailPrice = 0;
        this._save = (order) => new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let entityID = null;
            yield (order.ID ? (order.isDelete ? this._delete(order) : this._update(order)) : this._create(order)).then(returnedEntityID => (entityID = (order.isDelete ?
                null : returnedEntityID))).catch(error => reject(error));
            resolve(entityID);
        }));
        this.statusID = 0;
        this._update = (order) => this._saveDeclaredEntities(order).then(() => __awaiter(this, void 0, void 0, function* () {
            return this._calculatePrices(order.GUID, order.ID, order).then(() => this._readSQLColumns().then((sqlColumns) => __awaiter(this, void 0, void 0, function* () {
                let tempArr = [];
                for (let column of sqlColumns)
                    tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(order[column]))}`);
                return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${encodeSQLParameter(order.ID)}`).then(() => order.ID);
            })));
        }));
        this.userID = 0;
        this.valveCount = 0;
        this.vehicle = new Vehicle();
        this.vehicleID = 0;
    }
}
express.use(bodyparser.json(), (req, res, next) => {
    let origins = {
        "localhost": true,
        "magnecorpc-middle.herokuapp.com": true
    };
    res.header("Access-Control-Allow-Headers", "Accept, AuthToken, Content-Type, Origin, X-Requested-With");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Origin", (origins[req.hostname] ? req.get("origin") : "localhost:4200"));
    next();
});
express.listen((process.env.PORT || 9000), () => __awaiter(this, void 0, void 0, function* () {
    console.log("started Express server");
    //move endpoints here...?
}));
// SELECT name FROM SYSOBJECTS WHERE xtype = 'U'
express.get("/cableTypes", (req, res) => new CableType()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)));
express.get("/coilBoots", (req, res) => new CoilBoot()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)));
express.get("/coilCableCoilBootMappings", (req, res) => new CoilCableCoilBootMapping()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)));
express.get("/coilCablePlugBootIDs", (req, res) => new CoilCablePlugBootIDs()._read().then(data => res.send(data[0])).catch(error => res.status(500).send(error)));
express.get("/coilPackTypes", (req, res) => new CoilPackType()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)));
express.get("/dealer", (req, res) => new Dealer()._readHostname(req.hostname).then(data => res.send(data)).catch(error => res.status(500).send(error)));
express.get("/engineTypes", (req, res) => new EngineType()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)));
express.get("/order/GUID/:GUID", (req, res) => new Order()._readProperty("GUID", req.params.GUID, true, true).then(data => {
    if (data)
        res.send(data);
    else
        throw "No order matching the provided UID was found.";
}).catch(error => res.status(500).send(error)));
express.post("/order/save/:isOrder", (req, res) => {
    let order = req.body;
    order.statusID = ((req.params.isOrder === "true") ? ((order.statusID === 1) ? 2 : order.statusID) : 1);
    new Order()._save(order).then(data => res.send(String(data))).catch(error => res.status(500).send(error));
});
express.get("/orders", (req, res) => __awaiter(this, void 0, void 0, function* () {
    return new User()._readProperty("CURRENTPASSWORD", req.get("authToken")).then(user => {
        if (user)
            new Order()._readProperty("USERID", user.ID, false, false).then(orders => res.send(orders));
        else
            throw "There was an error in retrieving your orders.";
    }).catch(error => res.status(500).send(error));
}));
express.get("/orderStatuses", (req, res) => __awaiter(this, void 0, void 0, function* () { return new OrderStatus()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)); }));
express.get("/plugBoots", (req, res) => new PlugBoot()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)));
express.get("/states", (req, res) => __awaiter(this, void 0, void 0, function* () { return new State()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)); }));
express.post("/user/auth/login", (req, res) => {
    let credentials = req.body;
    let _userContext = new User();
    _userContext._readProperty("USERNAME", credentials.username).then(returnedUser => {
        let matchedUser = returnedUser;
        if (matchedUser)
            if (matchedUser.isActive)
                return _userContext._authenticate(null, credentials.password, matchedUser.currentPassword).then(() => res.send(matchedUser)).catch(() => _userContext._authenticate(null, matchedUser.currentPassword, credentials.password.trim()).then(() => res.status(204).send()));
        throw "There was no active user found matching the provided username.";
    }).catch(error => res.status(500).send(error));
});
express.post("/user/recovery/sendEmail", (req, res) => {
    let userRecovery = req.body;
    let _userContext = new User();
    _userContext._readProperty("USERNAME", userRecovery.username).then(returnedUser => {
        let matchedUser = returnedUser;
        if (matchedUser) {
            if (matchedUser.isActive)
                return _userContext._encryptPassphrase(matchedUser.emailAddress, matchedUser.currentPassword).then(cipherText => nodeMailer.sendMail({
                    from: "Magnecor <magnecordev@gmail.com>",
                    html: `<h3>Account Recovery</h3>
                    A password reset has been requested for your account. If this was prompted by you, please use the temporary password below to log in and change\
                     your password.
                    <br>
                    <br>
                    <b>${cipherText}</b>
                    <br>
                    <br>
                    Otherwise, please disregard this email.`,
                    subject: `Password Recovery`,
                    to: matchedUser.emailAddress,
                }, error => {
                    if (error)
                        throw error;
                }));
        }
    }).then(() => res.send()).catch(error => res.status(500).send(error));
});
express.get("/user/auth/token", (req, res) => new User()._readProperty("CURRENTPASSWORD", req.get("authToken")).then(user => {
    if (user)
        res.send(user);
    else
        throw "Your account session has expired.";
}).catch(error => res.status(500).send(error)));
express.post("/user/save", (req, res) => {
    let user = req.body;
    let _userContext = new User();
    _userContext._save(user).then(data => {
        if (data)
            _userContext._read(data).then(returnedUser => res.send(returnedUser));
        else
            res.send(null);
    }).catch(error => res.status(500).send(error));
});
express.post("/vehicle", (req, res) => {
    let vehicle = req.body;
    nodeFetch(`https://www.carqueryapi.com/api/0.3/?cmd=getTrims&make=${vehicle.make}&model=${vehicle.model}&year=${vehicle.year}&full_results=1`).then(res => res.json()).then(json => res.send(json)).catch(error => res.send(error));
});
//# sourceMappingURL=app.js.map