const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const SheetBosses = require("./sheet/SheetBosses");
const SheetLoot = require("./sheet/SheetLoot");
const SheetOptions = require("./sheet/SheetOptions");
const SheetPermissions = require("./sheet/SheetPermissions");
const SheetAliases = require("./sheet/SheetAliases");

const TOKEN_PATH = "googletoken.json";
const SCOPE = ["https://www.googleapis.com/auth/spreadsheets"];

class SpreadsheetController {
	constructor(credentials, spreadsheetId, ranges) {
		this.spreadsheetId = spreadsheetId;
		this.ranges = ranges;
		const { installed } = credentials;
		this.oAuth2Client = new google.auth.OAuth2(
			installed.client_id,
			installed.client_secret,
			installed.redirect_uris[0],
		);
		fs.readFile(TOKEN_PATH, (err, token) => {
			if (err) {
				this.newToken();
			} else {
				this.oAuth2Client.setCredentials(JSON.parse(token));
			}
		});
	}

	newToken() {
		const authUrl = this.oAuth2Client.generateAuthUrl({
			access_type: "offline",
			scope: SCOPE,
		});
		console.log("Auth URL: ", authUrl);
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		rl.question("Enter code: ", (code) => {
			rl.close();
			this.oAuth2Client.getToken(code, (err, token) => {
				if (err) {
					console.error(err);
					return;
				}
				this.oAuth2Client.setCredentials(token);
				fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err2) => {
					if (err2) {
						console.error("Failed to write token to file");
					} else {
						console.log("Wrote token to file");
					}
				});
			});
		});
	}

	async getSheetData() {
		const ranges = this.ranges;
		const sheets = google.sheets({
			version: "v4",
			auth: this.oAuth2Client,
		});
		const res = await sheets.spreadsheets.values.batchGet({
			spreadsheetId: this.spreadsheetId,
			ranges: [
				ranges.permissions, // Discord permissions
				ranges.loot, // Boss names, player names
				ranges.options, // Major upgrade, minor upgrade, etc.
				ranges.aliases, // Allows bosses to have more than one name, etc.
			],
		});
		const rangeValues = res.data.valueRanges.map((range) => range.values);
		const [
			permissionsSheet,
			lootSheet,
			optionsSheet,
			aliasesSheet,
		] = rangeValues;
		this.bosses = new SheetBosses(lootSheet);
		this.names = new SheetLoot(lootSheet);
		this.permissions = new SheetPermissions(permissionsSheet);
		this.options = new SheetOptions(optionsSheet);
		this.aliases = new SheetAliases(aliasesSheet);
	}

	async setLootStatus(name, boss, status) {
		const sheets = google.sheets({
			version: "v4",
			auth: this.oAuth2Client,
		});
		const column = this.bosses.getColumn(boss);
		const row = this.names.getRow(name);
		if (!column || !row) {
			throw new Error(`Column or row was not set. ${column}${row}`);
		}
		await sheets.spreadsheets.values.update({
			spreadsheetId: this.spreadsheetId,
			range: `${this.ranges.loot.split("!")[0]}!${column}${row}`,
			valueInputOption: "USER_ENTERED",
			resource: {
				values: [[status]],
			},
		});
	}
}

module.exports = SpreadsheetController;
