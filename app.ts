const bodyparser = require("body-parser")
const express = require("express")()
const nodeFetch = require("node-fetch")
const emailConfig = {
    auth: {
        user: "magnecordev@gmail.com",
        pass: "aPassword123"
    },
    service: "gmail"
}
const nodeMailer = require("nodemailer").createTransport(emailConfig)
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
}
const tedious = require("tedious")
const connection = new tedious.Connection(sqlConfig)
connection.on("connect", error => console.log((error || "signed into SQL database")))
const sqlRequest = tedious.Request
const TYPES = tedious.TYPES

const encodeSQLParameter = (parameter: any): string => {
    if (Array.isArray(parameter))
        parameter = (parameter.length ? parameter.join(",") : null)
    if (parameter === null)
        return "NULL"
    switch (typeof parameter) {
        case "boolean":
            return String((parameter as any) | 0)
        case "string":
            return `'${parameter}'`
        default:
            return String(parameter)
    }
}
const generateHTMLFromNestedArray = (array: string[][]): string => {
    let tempStr: string = `<table border="1">`
    for (let i = 0; (i < array.length); i++) {
        let row = array[i]
        if (i) {
            if (i == 1)
                tempStr += "<tbody>"
            tempStr += `<tr>${row.map(column => `<td>${column}</td>`).join("")}</tr>`
        } else
            tempStr += `<thead><tr>${row.map(column => `<th>${column}</th>`).join("")}</tr></thead>`
    }
    if (array.length > 1)
        tempStr += "</tbody>"
    return (tempStr += "</table>")
}
const mapObjectArray = (rows: any[]): any[] => {
    return rows.map(row => {
        let tempObj = {}
        for (let column of row)
            tempObj[column.metadata.colName] = column.value
        return tempObj
    })
}
const prefixOrderID = (index: number = 0, iterations: number = 2): string => {
    let returnedString: string = ""
    if (iterations) {
        let i: number = 0
        while (index) {
            let charCode: number = (Math.floor(index / Math.pow(36, (iterations - ++i))) + 65)
            returnedString += String.fromCharCode(charCode - ((charCode < 75) ? 17 : 10)).toLocaleUpperCase()
            index -= ((charCode === 65) ? 0 : ((index - (index % 36)) || index))
        }
        while (iterations !== returnedString.length)
            returnedString += "0"
    }
    return returnedString
}
const transformBoolean = (boolean: boolean): string => (boolean ? "Yes" : "No")

interface BooleanObject {
    [property: string]: boolean
}
interface Credentials {
    username: string
    password: string
}
interface MappedEntity {
    class: typeof DBO
    isArray?: boolean
    isFrozen?: boolean
    property: string
}
interface StringObject {
    [property: string]: string
}
interface SqlCache {
    queryCount: number
    queries: StringObject
}

let sqlCache: SqlCache = {
    queries: {},
    queryCount: 0
}

interface UserRecovery {
    username: string
}

class DBO {
    _arrayKeys: string[] = []
    _command = (command: string, isParsed: boolean = true): Promise<any[]> => new Promise((resolve, reject) => {
        console.log(command)
        connection.execSql(new sqlRequest(`${command}`, (error, rowCount, rows) => (error ? reject(error) : resolve((rows ?
            (isParsed ? mapObjectArray(rows) : rows) : null)))))
    })
    _count = (command?: string): Promise<number> => this._read(null, (command || `SELECT COUNT(*) FROM ${this._dbName}`), true, true, false)
    _create = (entity: DBO): Promise<number | string> => this._saveDeclaredEntities(entity).then(() => this._readSQLColumns().then(async sqlColumns => {
        let entityID: number = 0
        let tempArr: any[] = []
        await this._count(`SELECT MAX(ID) FROM ${this._dbName}`).then(count => (entityID = ++count)).catch(error => {throw error})
        for (let column of sqlColumns)
            tempArr.push((column === "ID") ? entityID : encodeSQLParameter(entity[column]))
        return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`)
            .then(() => entityID)
    }))
    createdDate: Date = null
    _dbName: string = null
    _delete = (data: any): Promise<any> => new Promise(async (resolve, reject) => {
        if (typeof data !== "object")
            await this._read(data).then(entity => (data = entity)).catch(error => reject(error))
        let entity: DBO = data
        entity.isDelete = true
        await this._saveDeclaredEntities(entity).catch(error => reject(error))
        resolve(this._command(`DELETE FROM ${this._dbName} WHERE ID = ${encodeSQLParameter(entity.ID)}`).then(() => 0))
    })
    ID: number | string = 0
    instantiate = (isExternal: boolean = false): Promise<any> => new Promise(async (resolve, reject) => {
        let properties: string[] = []
        if (isExternal)
            await this._readSQLColumns().then(columns => (properties = columns)).catch(error => reject(error))
        else
            properties = Object.keys(this).filter(key => !key.startsWith("_")) //make this recursive (internal)
        let tempObj = {}
        for (let property of properties)
            tempObj[property] = this[property]
        resolve(tempObj)
    })
    isDelete: boolean = false
    _mappedEntities: MappedEntity[] = []
    _read = (ID?: number | string, command?: string, isFirstRow: boolean = false, isFirstColumn: boolean = false, isEagerLoading: boolean = true): Promise<any> => {
        sqlCache.queryCount++
        let cachedResult = sqlCache.queries[(command = (command || `SELECT * FROM ${this._dbName}${(ID ? ` WHERE ID = ${encodeSQLParameter(ID)}` : "")}`))]
        return (cachedResult ? Promise.resolve(JSON.parse(cachedResult)) : this._command(command)).then(async rows => {
            if (!cachedResult)
                sqlCache.queries[command] = JSON.stringify(rows)
            rows = ((isFirstRow || !!ID) ? (rows.length ? rows[0] : null) : rows)
            if (rows) {
                if (isEagerLoading)
                    await this._readDeclaredEntities((Array.isArray(rows) ? rows : [rows])).catch(error => {throw error})
                if (isFirstColumn)
                    rows = (Array.isArray(rows) ? rows.map(row => row[""]) : rows[""])
            }
            return rows
        }).finally(() => {
            if (!--sqlCache.queryCount)
                sqlCache.queries = {}
        })
    }
    _readDeclaredEntities = (rows: any[]): Promise<void> => new Promise(async (resolve, reject) => {
        for (let row of rows) {
            for (let arrayKey of this._arrayKeys) {
                let value: any = row[arrayKey]
                row[arrayKey] = (value ? value.split(",") : [])
            }
            for (let mappedEntity of this._mappedEntities) {
                let property = {
                    name: mappedEntity.property,
                    truncatedName: mappedEntity.property.slice(0, (mappedEntity.property.length - 1))
                }
                if (mappedEntity.isArray) {
                    let entityArr: DBO[] = []
                    let entityIDs: any[] = (row[`${property.truncatedName}IDs`] = (row[`${property.truncatedName}IDs`] ?
                        row[`${property.truncatedName}IDs`].split(",") : []))
                    if (entityIDs) {
                        for (let entityID of entityIDs)
                            await new mappedEntity.class()._read(entityID).then(returnedEntity => entityArr.push(returnedEntity)).catch(error => reject(error))
                        row[property.name] = entityArr
                    } else
                        row[property.name] = []
                } else {
                    let entityID = row[`${property.name}ID`]
                    if (entityID)
                        await new mappedEntity.class()._read(entityID).then(returnedEntity => (row[property.name] = returnedEntity)).catch(error =>
                            reject(error))
                    else
                        row[property.name] = null
                }
            }
        }
        resolve()
    })
    _readProperty = (property: string, value: number | string, isFirstRow: boolean = true, isEagerLoading: boolean = true): Promise<any> => this._read(null,
        `SELECT * FROM ${this._dbName} WHERE ${property} = ${encodeSQLParameter(value)}`, isFirstRow, false, isEagerLoading)
    _readSQLColumns = (): Promise<string[]> => this._command(`SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = N'${this._dbName}'`)
        .then(rows => rows.map(row => row.COLUMN_NAME))
    _save = (entity: DBO): Promise<number | string> => (entity.ID ? (entity.isDelete ? this._delete(entity) : this._update(entity)) : this._create(entity))
    _saveDeclaredEntities = (entity: DBO): Promise<void> => new Promise(async (resolve, reject) => {
        for (let arrayKey of this._arrayKeys) {
            let value: any = entity[arrayKey]
            entity[arrayKey] = (value ? (Array.isArray(value) ? value.join(",") : value) : null)
        }
        for (let mappedEntity of this._mappedEntities) {
            if (!mappedEntity.isFrozen) {
                let property: string = mappedEntity.property
                if (mappedEntity.isArray) {
                    let entityIDs: any[] = []
                    let enumerableProperty: string = `${property.slice(0, (property.length - 1))}IDs`
                    for (let i = 0; (i < entity[property].length); i++) {
                        let pendingEntity: DBO = entity[property][i]
                        if (!((pendingEntity.isDelete = entity.isDelete) && !pendingEntity.ID)) {
                            await new mappedEntity.class()._save(pendingEntity).then(entityID => {
                                if (!pendingEntity.isDelete)
                                    entityIDs.push(entityID)
                            }).catch(error => reject(error))
                        }
                    }
                    entity[enumerableProperty] = (entityIDs.join(",") || null)
                } else {
                    let pendingEntity: DBO = entity[property]
                    if (!((pendingEntity.isDelete = entity.isDelete) && !pendingEntity.ID))
                        await new mappedEntity.class()._save(pendingEntity).then(entityID => (entity[`${property}ID`] = entityID)).catch(error => reject(error))
                }
            }
        }
        resolve()
    })
    _update = (entity: DBO): Promise<number | string> => this._saveDeclaredEntities(entity).then(async () => {
        return this._readSQLColumns().then(async sqlColumns => {
            let tempArr = []
            for (let column of sqlColumns)
                tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(entity[column]))}`)
            return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${encodeSQLParameter(entity.ID)}`).then(() => entity.ID)
        })
    })
    updatedDate: Date = null
}
class Address extends DBO {
    city: string = null
    _create = (address: Address): Promise<number | string> => this._readAddressMatches(address).then(async addressMatch => {
        if (addressMatch)
            return addressMatch.ID
        else
            return this._saveDeclaredEntities(address).then(() => this._readSQLColumns().then(async sqlColumns => {
                let addressID: number = 0
                let tempArr: any[] = []
                await this._count(`SELECT MAX(ID) FROM Addresses`).then(count => (addressID = ++count)).catch(error => {throw error})
                for (let column of sqlColumns)
                    tempArr.push((column === "ID") ? addressID : encodeSQLParameter(address[column]))
                return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`)
                    .then(() => addressID)
            }))
    })
    _delete = (data: any): Promise<any> => new Promise(async (resolve, reject) => {
        if (typeof data !== "object")
            await this._read(data).then(returnedAddress => (data = returnedAddress)).catch(error => reject(error))
        let address: Address = data
        resolve(this._readEntityDependencies(address).then(async count => {
            if (count < 2) {
                address.isDelete = true
                await this._saveDeclaredEntities(address).catch(error => {throw error})
                await this._command(`DELETE FROM ${this._dbName} WHERE ID = ${address.ID}`).catch(error => {throw error})
            }
            return 0
        }))
    })
    _dbName: string = "Addresses"
    ID: number = 0
    street: string = null
    stateID: number = 0
    _readAddressMatches = (address: Address, isFirstRow: boolean = true): Promise<any> => this._read(null, `SELECT * FROM Addresses WHERE CITY =\
     ${encodeSQLParameter(address.city)} AND STATEID = ${encodeSQLParameter(address.stateID)} AND STREET = ${encodeSQLParameter(address.street)}`, isFirstRow)
    _readEntityDependencies = (address: Address): Promise<number> => {
        let sqlSubstring: string = `WHERE ADDRESSID = ${encodeSQLParameter(address.ID)}`
        //.join() with " UNION ALL " :D
        return this._count(`SELECT COUNT(*) FROM (SELECT ID FROM Orders ${sqlSubstring} UNION ALL SELECT ID FROM Users ${sqlSubstring}) AS S`)
    }
    _update = (address: Address): Promise<number | string> => this._readEntityDependencies(address).then(count => {
        if (count > 1)
            return this._create(address)
        else
            return this._readAddressMatches(address).then(async addressMatch => {
                if (addressMatch && (address.ID !== addressMatch.ID))
                    return this._delete(address).then(() => addressMatch.ID)
                return this._saveDeclaredEntities(address).then(() => this._readSQLColumns().then(async sqlColumns => {
                    let tempArr = []
                    for (let column of sqlColumns)
                        tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(address[column]))}`)
                    return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${address.ID}`).then(() => address.ID)
                }))
            })
    })
    zipCode: string = null
}
class Boot extends DBO {
    angle: number = 0
    bootName: string = null
    code: string = null
    cost: number = 0
    _mappedEntities: MappedEntity[] = [{class: Terminal, isFrozen: true, property: "terminal"}]
    terminal = new Terminal
    terminalID: number = 0
    wireStartRatio: number = 0
}
class CableType extends DBO {
    cableTypeName: string = null
    code: string = null
    color: string = null
    cost: number = 0
    _dbName: string = "CableTypes"
    diameter: number = 0
}
class CoilBoot extends Boot {
    _dbName: string = "CoilBoots"
}
class Cable extends DBO {
    cableLength: number = 0
    coilBootID: number = 0
    plugBootID: number = 0
}
class CoilCable extends Cable {
    _dbName: string = "CoilCables"
}
class CoilCableCoilBootMapping extends DBO {
    _arrayKeys: string[] = ["coilBootIDs"]
    coilBootIDs: number[] = []
    coilPackTypeID: number = 0
    _dbName: string = "CoilCableCoilBootMappings"
}
class CoilCablePlugBootIDs extends DBO {
    _arrayKeys: string[] = ["plugBootIDs"]
    _dbName: string = "CoilCablePlugBootIDs"
    plugBootIDs: number[] = []
}
class CoilPackType extends DBO {
    coilPackName: string = null
    isMeasureUIVisible: boolean = false
    _dbName: string = "CoilPackTypes"
}
class Dealer extends DBO {
    backgroundColor: string = null
    costRatio: number = 0
    _dbName: string = "Dealers"
    dealerName: string = null
    emailAddress: string = null
    foregroundColor: string = null
    isActive: boolean = false
    logoURI: string = null
    origin: string = null
    _readOrigin = (origin: string): Promise<Dealer> => this._read(null, `SELECT * FROM Dealers WHERE ORIGIN LIKE '${origin}%'`, true, false, false)
        .then(data => {
            if (data)
                return data
            else
                throw "No dealer matching the referer was found."
        })
}
class EngineType extends DBO {
    _dbName: string = "EngineTypes"
    engineTypeName: string = null
}
class OrderStatus extends DBO {
    _dbName: string = "OrderStatuses"
    statusName: string = null
}
class PlugBoot extends Boot {
    _dbName: string = "PlugBoots"
}
class PlugCable extends Cable {
    _dbName: string = "PlugCables"
}
class State extends DBO {
    stateCode: string = null
    stateName: string = null
    _dbName: string = "States"
}
class Terminal extends DBO {
    code: string = null
    cost: number = 0
    _dbName: string = "Terminals"
    terminalName: string = null
}
class User extends DBO {
    address = new Address()
    addressID: number = 0
    _authenticate = (UID: number | string, decryptionKey: string, cipherText?: string): Promise<string> => this._read(null, `SELECT CONVERT (NVARCHAR(MAX),\
     DECRYPTBYPASSPHRASE(N'${decryptionKey}', CONVERT(VARBINARY(MAX), ${(cipherText || `(SELECT CURRENTPASSWORD FROM USERS WHERE ${((typeof UID === "string") ?
            "USERNAME" : "ID")} = ${encodeSQLParameter(UID)})`)}, 1)))`, true, true, false).then(password => {
                if (password)
                    return password
                else
                    throw "An incorrect password was provided."
            })
    _create = (user: User): Promise<number | string> => this._readUserMatches(user).then(() => this._encryptPassphrase(user.currentPassword).then(cipherText =>
        this._saveDeclaredEntities(user).then(() => this._readSQLColumns().then(async sqlColumns => {
            let entityID: number = 0
            let tempArr: any[] = []
            await this._count(`SELECT MAX(ID) FROM Users`).then(count => (entityID = ++count)).catch(error => {throw error})
            for (let column of sqlColumns)
                tempArr.push(((column === "ID") ? entityID : encodeSQLParameter(((column === "currentPassword") ? cipherText : user[column]))))
            return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`)
                .then(() => entityID)
        }))))
    currentPassword: string = null
    _dbName: string = "Users"
    _delete = (data: any): Promise<any> => new Promise(async (resolve, reject) => {
        if (typeof data !== "object")
            await this._read(data).then(entity => (data = entity)).catch(error => reject(error))
        let user: User = data
        user.isActive = !(user.isDelete = true)
        resolve(this._authenticate(user.ID, user.previousPassword).then(() => this._update(user)))
    })
    emailAddress: string = null
    _encryptPassphrase = (cleartext: string, passphrase?: string): Promise<string> => this._command(`SELECT CONVERT(VARCHAR(MAX),\
     ENCRYPTBYPASSPHRASE(N'${(passphrase || cleartext)}', N'${cleartext}'), 1)`).then(data => String(data[0][""]))
    firstName: string = null
    ID: number = 0
    isActive: boolean = true
    _mappedEntities: MappedEntity[] = [{class: Address, property: "address"}]
    lastName: string = null
    phoneNumber: string = null
    previousPassword?: string
    _readUserMatches = (user: User): Promise<void> => this._readProperty("EMAILADDRESS", user.emailAddress).then(matchedUser => {
        let userID: number = ((matchedUser ? matchedUser.ID : 0) as number)
        if (userID && (user.ID !== userID))
            throw "An account already exists with the same email address."
        else
            return this._readProperty("USERNAME", user.username).then(matchedUser => {
                userID = ((matchedUser ? matchedUser.ID : 0) as number)
                if (userID && (user.ID !== userID))
                    throw "An account already exists with same username."
            })
    })
    _update = (user: User): Promise<number | string> => this._authenticate(user.ID, user.previousPassword).then(() => this._readUserMatches(user).then(() =>
        this._encryptPassphrase(user.currentPassword || user.previousPassword).then(cipherText => {
            return this._saveDeclaredEntities(user).then(async () => {
                return this._readSQLColumns().then(async sqlColumns => {
                    let tempArr = []
                    for (let column of sqlColumns)
                        tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(((column === "currentPassword") ? cipherText :
                            user[column])))}`)
                    return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${encodeSQLParameter(user.ID)}`).then(() => user.ID)
                })
            })
        })))
    username: string = null
}
class Vehicle extends DBO {
    _create = (vehicle: Vehicle): Promise<number | string> => this._readVehicleMatches(vehicle).then(async vehicleMatch => {
        if (vehicleMatch)
            return vehicleMatch.ID
        else
            return this._saveDeclaredEntities(vehicle).then(() => this._readSQLColumns().then(async sqlColumns => {
                let tempArr: any[] = []
                let vehicleID: number = 0
                await this._count(`SELECT MAX(ID) FROM Vehicles`).then(count => (vehicleID = ++count)).catch(error => {throw error})
                for (let column of sqlColumns)
                    tempArr.push((column === "ID") ? vehicleID : encodeSQLParameter(vehicle[column]))
                return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`).then(() => vehicleID)
            }))
    })
    _dbName: string = "Vehicles"
    _delete = (data: any): Promise<any> => new Promise(async (resolve, reject) => {
        if (typeof data !== "object")
            await this._read(data).then(returnedVehicle => (data = returnedVehicle)).catch(error => reject(error))
        let vehicle: Vehicle = data
        resolve(this._readEntityDependencies(vehicle).then(async count => {
            if (count < 2) {
                vehicle.isDelete = true
                // await this._deleteMappedEntities(vehicle).catch(error => {throw error})
                await this._saveDeclaredEntities(vehicle).catch(error => {throw error})
                await this._command(`DELETE FROM ${this._dbName} WHERE ID = ${encodeSQLParameter(vehicle.ID)}`).catch(error => {throw error})
            }
            return 0
        }))
    })
    make: string = null
    model: string = null
    _readVehicleMatches = (vehicle: Vehicle, isFirstRow: boolean = true): Promise<any> => this._read(null, `SELECT * FROM Vehicles WHERE MAKE =\
     ${encodeSQLParameter(vehicle.make)} AND MODEL = ${encodeSQLParameter(vehicle.model)} AND YEAR = ${encodeSQLParameter(vehicle.year)}`, isFirstRow, false, false)
    _readEntityDependencies = (vehicle: Vehicle): Promise<number> => this._count(`SELECT COUNT(*) FROM Orders WHERE VEHICLEID = ${encodeSQLParameter(vehicle.ID)}`)
    _update = (vehicle: Vehicle): Promise<number | string> => this._readEntityDependencies(vehicle).then(count => {
        if (count > 1)
            return this._create(vehicle)
        else
            return this._readVehicleMatches(vehicle).then(async vehicleMatch => {
                if (vehicleMatch && (vehicle.ID !== vehicleMatch.ID))
                    return this._delete(vehicle).then(() => vehicleMatch.ID)
                return this._saveDeclaredEntities(vehicle).then(() => this._readSQLColumns().then(async sqlColumns => {
                    let tempArr = []
                    for (let column of sqlColumns)
                        tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(vehicle[column]))}`)
                    return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${vehicle.ID}`).then(() => vehicle.ID)
                }))
            })
    })
    year: number = 0
}
class Order extends DBO {
    address = new Address()
    addressID: number = 0
    cableTypeID: number = 0
    cavityDepth: number = 0
    _create = (order: Order): Promise<number | string> => this._saveDeclaredEntities(order).then(() => this._readSQLColumns().then(async sqlColumns => {
        let dealerPrefix: string = prefixOrderID(order.dealerID)
        let GUID: string = null
        let orderID: string = null
        let tempArr: any[] = []
        await this._count(`SELECT COUNT(*) FROM Orders WHERE ID LIKE '${dealerPrefix}%'`).then(count => (orderID = `${dealerPrefix}${String(new Date()
            .getFullYear()).slice(2, 4)}${((0).toFixed(4) + ++count).slice(-4)}`)).catch(error => {throw error})
        await this._read(null, `SELECT CONVERT(varchar(36), NEWID())`, true, true, false).then(data => (GUID = (data as any))).catch(error => {throw error})
        await this._calculatePrices(GUID, orderID, order).catch(error => {throw error})
        for (let column of sqlColumns)
            tempArr.push(encodeSQLParameter((column === "ID") ? orderID : ((column === "GUID") ? GUID : order[column])))
        return this._command(`INSERT INTO ${this._dbName} (${sqlColumns.join(", ")}) VALUES (${tempArr.join(", ")})`).then(() => orderID)
    }))
    coilCableIDs: number[] = []
    coilCables: CoilCable[] = []
    coilPackTypeID: number = 0
    coilTowerOuterDiameter: number = 0
    cost: number = 0
    cylinderCount: number = 0
    dealerID: number = 0
    dealerPrice: number = 0
    _dbName: string = "Orders"
    _calculatePrices = (GUID: string, orderID: string, order: Order): Promise<any> => new Promise(async (resolve, reject) => {
        let coilBoots: {[property: number]: CoilBoot} = {}
        let plugBoots: {[property: number]: PlugBoot} = {}
        let cableTypes: {[property: number]: CableType} = {}
        let coilPackTypes: {[property: number]: CoilPackType} = {}
        let cost: number = 0
        let dealer: Dealer = null
        let states: {[property: number]: State} = {}
        await new CoilBoot()._read().then(data => data.forEach(boot => coilBoots[boot.ID] = boot)).catch(error => reject(error))
        await new PlugBoot()._read().then(data => data.forEach(boot => plugBoots[boot.ID] = boot)).catch(error => reject(error))
        await new CableType()._read().then(data => data.forEach(cableType => cableTypes[cableType.ID] = cableType)).catch(error =>
            reject(error))
        await new CoilPackType()._read().then(data => data.forEach(coilPackType => coilPackTypes[coilPackType.ID] = coilPackType))
            .catch(error => reject(error))
        await new Dealer()._read(order.dealerID).then(data => (dealer = data)).catch(error => reject(error))
        await new State()._read().then(data => data.forEach(state => states[state.ID] = state)).catch(error => reject(error))
        let plugCables: PlugCable[] = order.plugCables.filter(plugCable => !plugCable.isDelete)
        let coilCables: CoilCable[] = order.coilCables.filter(coilCable => !coilCable.isDelete)
        for (let plugCable of plugCables) {
            let coilBoot: Boot = coilBoots[plugCable.coilBootID]
            let plugBoot: Boot = plugBoots[plugCable.plugBootID]
            cost += ((coilBoot ? (coilBoot.cost + coilBoot.terminal.cost) : 0) + (plugBoot ? (plugBoot.cost + plugBoot.terminal.cost) : 0) + (plugCable.cableLength *
                cableTypes[order.cableTypeID].cost))
        }
        for (let coilCable of coilCables) {
            let coilBoot: Boot = coilBoots[coilCable.coilBootID]
            let plugBoot: Boot = plugBoots[coilCable.plugBootID]
            cost += ((coilBoot ? (coilBoot.cost + coilBoot.terminal.cost) : 0) + (plugBoot ? (plugBoot.cost + plugBoot.terminal.cost) : 0) + (coilCable.cableLength *
                cableTypes[order.cableTypeID].cost))
        }
        let laborPrice: number = 0
        if (order.cylinderCount <= 5)
            laborPrice = 21
        else if ((order.cylinderCount > 5) && (order.cylinderCount < 8))
            laborPrice = 42
        else if (order.cylinderCount == 8)
            laborPrice = 63
        else
            laborPrice = 84
        //where the heck are costs...?
        let numberedPrice: number = (((order.isNumbered as any) | 0) * order.cylinderCount * (coilCables.length + plugCables.length))
        let retailPrice: number = ((cost * 2.85) + laborPrice + numberedPrice)
        // let retailPrice: number = (cost / 0.2)
        // let change: number = Number("0." + retailPrice.toFixed(13).split(".")[1])
        // retailPrice = Math.trunc(retailPrice)
        // retailPrice = (((retailPrice % 2) + 1) + retailPrice)
        // let tempCost = Number(String(change).replace("0.", ""))
        // change = Number("0." + (((tempCost % 2) + 1) + tempCost))
        //retailPrice + change (below)
        order.dealerPrice = (dealer.costRatio * (order.retailPrice = retailPrice))
        if (order.statusID > 1) {
            let emailAddresses = {
                0: "nicholasveal@hotmail.com", //orders@magnecor.com
                1: dealer.emailAddress,
                2: order.emailAddress
            }
            for (let i = 0; (i < 3); i++) {
                let html: string = `<h3>Details</h3>`
                if (order.isDelete)
                    html += `This order has been cancelled.`
                else {
                    if (i === 2)
                        html += `This order has been placed with a customer price/MSRP of $${order.retailPrice.toFixed(2)}. Your estimated dealer price is
                         $${order.dealerPrice.toFixed(2)}.`
                    else {
                        if (i)
                            html += `Your order UID is ${GUID}. Place this in the calculator search box to access/modify your order later.<br><br>`
                        let detailArr: string[][] = [["Property", "Value"].concat((i ? [] : ["Retail Price"]))]
                        detailArr.push(["Name", `${order.firstName} ${order.lastName}`],
                            ["Address", `${order.address.street}<br>
                            ${order.address.city}, ${states[order.address.stateID].stateName} ${order.address.zipCode}`],
                            ["Phone Number", `${order.phoneNumber}`],
                            ["Email Address", `${order.emailAddress}`],
                            ["Vehicle", `${order.vehicle.year} ${order.vehicle.make} ${order.vehicle.model}`])
                        if (order.engineCode)
                            detailArr.push(["Engine Code", `${order.engineCode}`])
                        detailArr.push(["Engine Replacement", `${transformBoolean(order.isEngineReplacement)}`])
                        if (order.engineSize)
                            detailArr.push(["Engine Size", `${order.engineSize}`])
                        detailArr.push(["Cylinder Count", `${order.cylinderCount}`],
                            ["Valve Count", `${order.valveCount}`],
                            ["SOHC/DOHC", `${(order.isDOHC ? "DOHC" : "SOHC")}`],
                            ["Coil Pack Type", `${coilPackTypes[order.coilPackTypeID].coilPackName}`])
                        if (coilPackTypes[order.coilPackTypeID].isMeasureUIVisible)
                            detailArr.push(["Coil Tower Outer Diameter", `${Number(order.coilTowerOuterDiameter)} inches`],
                                ["Cavity Depth", `${Number(order.cavityDepth)} inches`])
                        detailArr.push(["Cable Type", `${cableTypes[order.cableTypeID].cableTypeName}`],
                            ["Numbered Cables", `${transformBoolean(order.isNumbered)}`].concat((i ? [] : [`$${numberedPrice}`])))
                        html += generateHTMLFromNestedArray(detailArr)
                        if (plugCables.length) {
                            html += `<h3>Plug Cables</h3>`
                            let plugCableArr: string[][] = [["Item"].concat((i ? [] : ["Retail Price"]))]
                            for (let cableIndex = 0; (cableIndex < plugCables.length); cableIndex++) {
                                let plugCable: PlugCable = plugCables[cableIndex]
                                let coilBoot: Boot = coilBoots[plugCable.coilBootID]
                                let plugBoot: Boot = plugBoots[plugCable.plugBootID]
                                plugCableArr.push([`<em>Cable ${(cableIndex + 1)}</em>`],
                                    [`${coilBoot.bootName} (${coilBoot.code})`].concat((i ? [] : [`$${(coilBoot.cost * 2.85).toFixed(2)}`])),
                                    [`${coilBoot.terminal.terminalName} (${coilBoot.terminal.code})`].concat((i ? [] : [`$${(coilBoot.terminal.cost * 2.85).toFixed(2)}`])), [`${plugCable.cableLength} inches of ${cableTypes[order.cableTypeID].cableTypeName} cable`].concat((i ? [] :
                                        [`$${((plugCable.cableLength * cableTypes[order.cableTypeID].cost * 2.85)).toFixed(2)}`])),
                                    [`${plugBoot.bootName} (${plugBoot.code})`].concat((i ? [] : [`$${(plugBoot.cost * 2.85).toFixed(2)}`])),
                                    [`${plugBoot.terminal.terminalName} (${plugBoot.terminal.code})`].concat((i ? [] : [`$${(plugBoot.terminal.cost * 2.85).toFixed(2)}`])))
                            }
                            html += generateHTMLFromNestedArray(plugCableArr)
                        }
                        if (coilCables.length) {
                            html += `<h3>Coil Cables</h3>`
                            let coilCableArr: string[][] = [["Item"].concat((i ? [] : ["Retail Price"]))]
                            for (let cableIndex = 0; (cableIndex < coilCables.length); cableIndex++) {
                                let coilCable: CoilCable = coilCables[cableIndex]
                                let coilBoot: Boot = coilBoots[coilCable.coilBootID]
                                let plugBoot: Boot = plugBoots[coilCable.plugBootID]
                                coilCableArr.push([`<em>Cable ${(cableIndex + 1)}</em>`],
                                    [`${coilBoot.bootName} (${coilBoot.code})`].concat((i ? [] : [`$${(coilBoot.cost * 2.85).toFixed(2)}`])),
                                    [`${coilBoot.terminal.terminalName} (${coilBoot.terminal.code})`].concat((i ? [] : [`$${(coilBoot.terminal.cost * 2.85).toFixed(2)}`])), [`${coilCable.cableLength} inches of ${cableTypes[order.cableTypeID].cableTypeName} cable`].concat((i ?
                                        [] : [`$${((coilCable.cableLength * cableTypes[order.cableTypeID].cost * 2.85)).toFixed(2)}`])),
                                    [`${plugBoot.bootName} (${plugBoot.code})`].concat((i ? [] : [`$${(plugBoot.cost * 2.85).toFixed(2)}`])),
                                    [`${plugBoot.terminal.terminalName} (${plugBoot.terminal.code})`].concat((i ? [] : [`$${(plugBoot.terminal.cost * 2.85).toFixed(2)}`])))
                            }
                            html += generateHTMLFromNestedArray(coilCableArr)
                        }
                        html += `<h3>Labor Price</h3>`
                        html += `<div>$${laborPrice.toFixed(2)}</div>`
                        html += `<h3><em><u>Total${(i ? "" : "s")}</u></em></h3>`
                        if (!i)
                            html += `<div>Dealer Price: $${order.dealerPrice.toFixed(2)}</div>`
                        html += `<div>Customer Price (estimated/MSRP): $${retailPrice.toFixed(2)}</div>`
                    }
                    await nodeMailer.sendMail({
                        from: "Magnecor <magnecordev@gmail.com>",
                        html: html,
                        subject: `Order #${orderID} Update`,
                        to: emailAddresses[i],
                    }, error => {
                        if (error)
                            reject(error)
                    })
                }
            }
        }
        resolve()
    })
    _delete = (data: any): Promise<any> => new Promise(async (resolve, reject) => {
        if (typeof data !== "object")
            await this._read(data).then(entity => (data = entity)).catch(error => reject(error))
        let order: Order = data
        order.isDelete = true
        await this._calculatePrices(order.GUID, order.ID, order).catch(error => reject(error))
        await this._saveDeclaredEntities(order).catch(error => reject(error))
        resolve(this._command(`DELETE FROM ${this._dbName} WHERE ID = ${encodeSQLParameter(order.ID)}`).then(() => null))
    })
    emailAddress: string = null
    engineCode: string = null
    engineSize: string = null
    engineTypeID: number = 0
    firstName: string = null
    GUID: string = null
    ID: string = null
    isDOHC: boolean = false
    isNumbered: boolean = false
    isEngineReplacement: boolean = false
    lastName: string = null
    _mappedEntities: MappedEntity[] = [
        {class: Address, property: "address"},
        {class: CoilCable, isArray: true, property: "coilCables"},
        {class: PlugCable, isArray: true, property: "plugCables"},
        {class: Vehicle, property: "vehicle"}
    ]
    phoneNumber: string = null
    plugCableIDs: number[] = []
    plugCables: PlugCable[] = []
    retailPrice: number = 0
    _save = (order: Order): Promise<number | string> => new Promise(async (resolve, reject) => {
        let entityID: number | string = null
        await (order.ID ? (order.isDelete ? this._delete(order) : this._update(order)) : this._create(order)).then(returnedEntityID => (entityID = (order.isDelete ?
            null : returnedEntityID))).catch(error => reject(error))
        resolve(entityID)
    })
    statusID: number = 0
    _update = (order: Order): Promise<number | string> => this._saveDeclaredEntities(order).then(async () =>
        this._calculatePrices(order.GUID, order.ID, order).then(() => this._readSQLColumns().then(async sqlColumns => {
            let tempArr = []
            for (let column of sqlColumns)
                tempArr.push(`${column} = ${((column === "updatedDate") ? "GETDATE()" : encodeSQLParameter(order[column]))}`)
            return this._command(`UPDATE ${this._dbName} SET ${tempArr.join(", ")} WHERE ID = ${encodeSQLParameter(order.ID)}`).then(() => order.ID)
        })))
    userID: number = 0
    valveCount: number = 0
    vehicle = new Vehicle()
    vehicleID: number = 0
}
express.use(bodyparser.json(), (req, res, next) => {
    let origins = {
        "http://localhost:4200": true,
        "https://magnecorpc-front.herokuapp.com": true
    }
    res.header("Access-Control-Allow-Headers", "Accept, AuthToken, Content-Type, Origin, X-Requested-With")
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.header("Access-Control-Allow-Origin", (origins[req.get("origin")] ? req.get("origin") : "http://localhost:4200"))
    next()
})
express.listen((process.env.PORT || 9000), async () => {
    console.log("started Express server")
    //move endpoints here...?
})

// SELECT name FROM SYSOBJECTS WHERE xtype = 'U'

express.get("/cableTypes", (req, res) => new CableType()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/coilBoots", (req, res) => new CoilBoot()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/coilCableCoilBootMappings", (req, res) => new CoilCableCoilBootMapping()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/coilCablePlugBootIDs", (req, res) => new CoilCablePlugBootIDs()._read().then(data => res.send(data[0])).catch(error => res.status(500).send(error)))
express.get("/coilPackTypes", (req, res) => new CoilPackType()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/dealer", (req, res) => new Dealer()._readOrigin(req.get("origin")).then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/engineTypes", (req, res) => new EngineType()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/order/GUID/:GUID", (req, res) => new Order()._readProperty("GUID", req.params.GUID, true, true).then(data => {
    if (data)
        res.send(data)
    else
        throw "No order matching the provided UID was found."
}).catch(error => res.status(500).send(error)))
express.post("/order/save/:isOrder", (req, res) => {
    let order: Order = req.body
    order.statusID = ((req.params.isOrder === "true") ? ((order.statusID === 1) ? 2 : order.statusID) : 1)
    new Order()._save(order).then(data => res.send(String(data))).catch(error => res.status(500).send(error))
})
express.get("/orders", async (req, res) => new User()._readProperty("CURRENTPASSWORD", req.get("authToken")).then(user => {
    if (user)
        new Order()._readProperty("USERID", user.ID, false, false).then(orders => res.send(orders))
    else
        throw "There was an error in retrieving your orders."
}).catch(error => res.status(500).send(error)))
express.get("/orderStatuses", async (req, res) => new OrderStatus()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/plugBoots", (req, res) => new PlugBoot()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.get("/states", async (req, res) => new State()._read().then(data => res.send(data)).catch(error => res.status(500).send(error)))
express.post("/user/auth/login", (req, res) => {
    let credentials: Credentials = req.body
    let _userContext = new User()
    _userContext._readProperty("USERNAME", credentials.username).then(returnedUser => {
        let matchedUser: User = returnedUser
        if (matchedUser)
            if (matchedUser.isActive)
                return _userContext._authenticate(null, credentials.password, matchedUser.currentPassword).then(() => res.send(matchedUser)).catch(() =>
                    _userContext._authenticate(null, matchedUser.currentPassword, credentials.password.trim()).then(() => res.status(204).send()))
        throw "There was no active user found matching the provided username."
    }).catch(error => res.status(500).send(error))
})
express.post("/user/recovery/sendEmail", (req, res) => {
    let userRecovery: UserRecovery = req.body
    let _userContext = new User()
    _userContext._readProperty("USERNAME", userRecovery.username).then(returnedUser => {
        let matchedUser: User = returnedUser
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
                        throw error
                }))
        }
    }).then(() => res.send()).catch(error => res.status(500).send(error))
})
express.get("/user/auth/token", (req, res) => new User()._readProperty("CURRENTPASSWORD", req.get("authToken")).then(user => {
    if (user)
        res.send(user)
    else
        throw "Your account session has expired."
}).catch(error => res.status(500).send(error)))
express.post("/user/save", (req, res) => {
    let user: User = req.body
    let _userContext = new User()
    _userContext._save(user).then(data => {
        if (data)
            _userContext._read(data).then(returnedUser => res.send(returnedUser))
        else
            res.send(null)
    }).catch(error => res.status(500).send(error))
})
express.post("/vehicle", (req, res) => {
    let vehicle: Vehicle = req.body
    nodeFetch(`https://www.carqueryapi.com/api/0.3/?cmd=getTrims&make=${vehicle.make}&model=${vehicle.model}&year=${vehicle.year}&full_results=1`).then(res =>
        res.json()).then(json => res.send(json)).catch(error => res.send(error))
})