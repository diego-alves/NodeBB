/* jslint node: true */

'use strict';

var async = require('async');
var path = require('path');

var db = require('./database');
var utils = require('../public/src/utils');

var Upgrade = {
	available: [
		{
			version: '1.0.0',
			upgrades: ['chat_upgrade', 'chat_room_hashes', 'theme_to_active_plugins', 'user_best_posts', 'users_notvalidated', 'global_moderators', 'social_post_sharing'],
		},
		{
			version: '1.1.0',
			upgrades: ['group_title_update', 'user_post_count_per_tid', 'dismiss_flags_from_deleted_topics', 'assign_topic_read_privilege', 'separate_upvote_downvote'],
		},
		{
			version: '1.1.1',
			upgrades: ['upload_privileges', 'remove_negative_best_posts'],
		},
		{
			version: '1.2.0',
			upgrades: ['category_recent_tids', 'edit_delete_deletetopic_privileges'],
		},
		{
			version: '1.3.0',
			upgrades: ['favourites_to_bookmarks', 'sorted_sets_for_post_replies'],
		},
		{
			version: '1.4.0',
			upgrades: ['global_and_user_language_keys', 'sorted_set_for_pinned_topics'],
		},
		{
			version: '1.5.0',
			upgrades: ['flags_refactor'],
		},
	],
};

Upgrade.run = function (callback) {
	process.stdout.write('\nParsing upgrade scripts... ');
	var queue = [];
	var skipped = 0;

	// Retrieve list of upgrades that have already been run
	db.getSortedSetRange('schemaLog', 0, -1, function (err, completed) {
		if (err) {
			return callback(err);
		}

		queue = Upgrade.available.reduce(function (memo, cur) {
			cur.upgrades.forEach(function (filename) {
				if (completed.indexOf(filename) === -1) {
					memo.push(path.join(__dirname, './upgrades', filename));
				} else {
					skipped += 1;
				}
			});

			return memo;
		}, queue);

		Upgrade.process(queue, skipped, callback);
	});
};

Upgrade.runSingle = function (query, callback) {
	process.stdout.write('\nParsing upgrade scripts... ');

	async.waterfall([
		async.apply(utils.walk, path.join(__dirname, './upgrades')),
		function (files, next) {
			next(null, files.filter(function (file) {
				return file.search(new RegExp(query)) !== -1;
			}));
		},
	], function (err, files) {
		if (err) {
			return callback(err);
		}

		Upgrade.process(files, 0, callback);
	});
};

Upgrade.process = function (files, skipCount, callback) {
	process.stdout.write('OK'.green + ' | '.reset + String(files.length).cyan + ' script(s) found'.cyan + (skipCount > 0 ? ', '.cyan + String(skipCount).cyan + ' skipped'.cyan : '') + '\n'.reset);

	// Do I need to sort the files here? we'll see.
	// sort();

	async.eachSeries(files, function (file, next) {
		var scriptExport = require(file);
		var date = new Date(scriptExport.timestamp);

		process.stdout.write('  → '.white + String('[' + [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()].join('/') + '] ').gray + String(scriptExport.name).reset + '... ');

		// Do the upgrade...
		scriptExport.method(function (err) {
			if (err) {
				process.stdout.write('error\n'.red);
				return next(err);
			}

			// Record success in schemaLog
			db.sortedSetAdd('schemaLog', Date.now(), path.basename(file, '.js'));

			process.stdout.write('OK\n'.green);
			next();
		});
	}, function (err) {
		if (err) {
			return callback(err);
		}

		process.stdout.write('Upgrade complete!\n\n'.green);
		callback();
	});
};

module.exports = Upgrade;
