/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 2.16.0 from webgme on Fri Nov 17 2017 17:12:36 GMT-0600 (Central Standard Time).
 * A plugin that inherits from the PluginBase. To see source code documentation about available
 * properties and methods visit %host%/docs/source/PluginBase.html.
 */

define([
		'plugin/PluginConfig',
		'text!./metadata.json',
		'plugin/PluginBase'
	], function (
		PluginConfig,
		pluginMetadata,
		PluginBase) {
	'use strict';

	pluginMetadata = JSON.parse(pluginMetadata);

	/**
	 * Initializes a new instance of CPNMarkingGenerator.
	 * @class
	 * @augments {PluginBase}
	 * @classdesc This class represents the plugin CPNMarkingGenerator.
	 * @constructor
	 */
	var CPNMarkingGenerator = function () {
		// Call base class' constructor.
		PluginBase.call(this);
		this.pluginMetadata = pluginMetadata;
	};

	/**
	 * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructue etc.
	 * This is also available at the instance at this.pluginMetadata.
	 * @type {object}
	 */
	CPNMarkingGenerator.metadata = pluginMetadata;

	// Prototypical inheritance from PluginBase.
	CPNMarkingGenerator.prototype = Object.create(PluginBase.prototype);
	CPNMarkingGenerator.prototype.constructor = CPNMarkingGenerator;

	/**
	 * Main function for the plugin to execute. This will perform the execution.
	 * Notes:
	 * - Always log with the provided logger.[error,warning,info,debug].
	 * - Do NOT put any user interaction logic UI, etc. inside this method.
	 * - callback always has to be called even if error happened.
	 *
	 * @param {function(string, plugin.PluginResult)} callback - the result callback
	 */
	CPNMarkingGenerator.prototype.main = function (callback) {
		var self = this,
		activeNode = this.activeNode,
		core = this.core,
		logger = this.logger,
		artifacts = [],
		artifactPromises = [],
		msgIdsMap = {},
		today = new Date(),
		dateStr = '';

		let month = today.getMonth() + 1;
		dateStr = month + '-' + today.getDate() + '-' + today.getFullYear() + '_';
		dateStr = dateStr + today.getHours() + '-' + today.getUTCMinutes();

		self.loadNodeMap(activeNode)
		.then(function (nodeMap) {

			/* Find all software buses within the nodeMap and generate appropriate subscription tables */
			for (const node in nodeMap) {
				if ((self.isMetaTypeOf(nodeMap[node], self.META.SoftwareBus)) && !(core.isMetaNode(nodeMap[node]))) {
					msgIdsMap = genSubscriberTable(self, nodeMap, nodeMap[node]);
				}
			}

			return self.save("Generated subscription table");
		})
		.then(function (commitResult) {
			/* Must reload node map after making changes. PS: Javascript is hideous */
			self.loadNodeMap(activeNode)
			.then(function (nodeMap) {
				/* For each CFS System in nodeMap, generate a set of CPN initial markings */
				for (const node in nodeMap) {
					if ((self.isMetaTypeOf(nodeMap[node], self.META.CFSSystem)) && !(core.isMetaNode(nodeMap[node]))) {
						let sysName = core.getAttribute(nodeMap[node], 'name'),
						artifact = self.blobClient.createArtifact(sysName + '_' + dateStr);

						artifacts.push(artifact);
						artifactPromises.push(genSystemMarkings(self, nodeMap, artifact, msgIdsMap, nodeMap[node]));
					}
				}

				/* Wait for all tasks to complete */
				Promise.all(artifactPromises)
				.then(function (fileHashes) {
					/* Save all artifacts and record hash promises */
					let artifactHashPromises = [];
					for (let i = 0; i < artifacts.length; i++) {
						artifactHashPromises.push(artifacts[i].save());
					}
					return artifactHashPromises;
				})
				.then(function (artifactHashPromises) {
					/* Wait for all artifacts to save */
					Promise.all(artifactHashPromises)
					.then(function (hashes) {
						/* Add all artifact hashes to result */
						for (let i = 0; i < hashes.length; i++) {
							self.result.addArtifact(hashes[i]);
						}
						self.result.setSuccess(true);
						callback(null, self.result);
					})
					/* Promise.all artifactHashPromises catch */
					.catch (function (err) {
						logger.error(err);
						callback(err);
					});
				})
				/* Promise.all artifactPromises catch */
				.catch (function (err) {
					logger.error(err);
					callback(err);
				});
			})
			/* 2nd loadNodeMap catch */
			.catch (function (err) {
				logger.error(err);
				callback(err);
			});
		})
		/* loadNodeMap catch */
		.catch (function (err) {
			logger.error(err);
			callback(err);
		});
	}

	/* Function to find all nodes of a given meta type (metaName) contained within a node */
	/* Only searches immediate children. Returns array of desired nodes */
	function getContainedMetaType(node, self, metaType) {
		let core = self.core,
		childIds = core.getChildrenRelids(node),
		nodes = [];

		for (let i = 0; i < childIds.length; i++) {
			let child = core.getChild(node, childIds[i]);

			if (self.isMetaTypeOf(child, metaType)) {
				nodes.push(child);
			}
		}
		return nodes;
	}

	function genSystemMarkings(self, nodeMap, artifact, msgIdsMap, sysNode) {
		let core = self.core,
		logger = self.logger,
		subTableStr = '',
		schTableStr = '',
		plexilStr = '',
		envStr = '';

		for (const node in nodeMap) {
			/* If node is a Subscription table, generate subTableStr. Should only be 1 subscription table per system */
			if ((self.isMetaTypeOf(nodeMap[node], self.META.SubscriptionTable)) && !(core.isMetaNode(nodeMap[node]))) {
				subTableStr = getSubscriptionTableStr(self, nodeMap, nodeMap[node]);
			}
		}

		let appNodes = getContainedMetaType(sysNode, self, self.META.GenericApp),
		appStr = '[';
		for (let i = 0; i < appNodes.length; i++) {
			let app = appNodes[i];

			if (!(core.isMetaNode(app))) {
				appStr += getAppStr(self, nodeMap, msgIdsMap, app);
				appStr += ',\n\n';
			}
		}
		/* Format appStr */
		if (appStr.endsWith(',\n\n')) {
			appStr = appStr.slice(0, -3);
		}
		appStr += ']';

		let envNodes = getContainedMetaType(sysNode, self, self.META.Environment);
		if (envNodes.length > 1) {
			logger.error("System node (path: ", core.getPath(sysNode), ") contains multiple Environments.");
		} else if (envNodes.length < 1) {
			logger.error("System node (path: ", core.getPath(sysNode), ") has no Environment.");
		} else {
			envStr = getEnviornmentStr(self, nodeMap, msgIdsMap, envNodes[0]);
		}

		let schNodes = getContainedMetaType(sysNode, self, self.META.CFSScheduler)
			if (schNodes.length > 1) {
				logger.error("System node (path: ", core.getPath(sysNode), ") contains multiple scheduler apps.");
			} else if (schNodes.length == 1) {
				schTableStr = getSchedulerTableStr(self, nodeMap, msgIdsMap, schNodes[0]);
			}

			let plexilNodes = getContainedMetaType(sysNode, self, self.META.PLEXIL);
		if (plexilNodes.length > 1) {
			logger.error("System node (path: ", core.getPath(sysNode), ") contains multiple PLEXIL apps.");
		} else if (plexilNodes.length === 1) {
			plexilStr = getPlexilStr(self, nodeMap, msgIdsMap, plexilNodes[0]);
		}

		/* Add text files to artifact. Return promise */
		return artifact.addFiles({
			'subscriptionTable.txt': subTableStr,
			'apps.txt': appStr,
			'environment.txt': envStr,
			'schedulerTable.txt': schTableStr,
			'plexil.txt': plexilStr
		})
	}

	function getSubscriptionTableStr(self, nodeMap, subTableNode) {
		let core = self.core,
		logger = self.logger,
		subs = getContainedMetaType(subTableNode, self, self.META.Subscriber),
		subTableStr = '',
		msgIdMap = {};

		/* For each subscription, get app name and subscribed message ID's */
		subTableStr = '[';
		for (let i = 0; i < subs.length; i++) {
			let appName = core.getAttribute(subs[i], 'name'),
			subMsgs = getContainedMetaType(subs[i], self, self.META.Message),
			msgIds = subMsgs.map(function (msg) {
					return core.getAttribute(msg, 'msg_id');
				}),
			msgIdStr = msgIds.toString();

			for (let j = 0; j < subMsgs.length; j++) {
				let msgName = core.getAttribute(subMsgs[j], 'name'),
				msgId = core.getAttribute(subMsgs[j], 'msg_id');

				msgIdMap[msgName] = msgId;
			}

			subTableStr += '{app_name="' + appName + '", msgs=[' + msgIdStr + ']},\n'
		}

		/* Formatting */
		if (subTableStr.endsWith(',\n')) {
			subTableStr = subTableStr.slice(0, -2);
		}
		subTableStr += ']';

		/* Sort object names by acsending msg id's */
		/* Probably a better way to do this, but this is simple and works */
		let sortedNames = [];
		for (const name in msgIdMap) {
			sortedNames.push(name);
		}
		sortedNames.sort(function (a, b) {
			return (msgIdMap[a] - msgIdMap[b]);
		});

		/* Create MSG Name - ID table */
		subTableStr += '\n\n\nMSG ID - MSG Name\n'
		for (let i = 0; i < sortedNames.length; i++) {
			let name = sortedNames[i];
			subTableStr += msgIdMap[name] + ' - ' + name + '\n';
		}

		return subTableStr;
	}

	function getAppStr(self, nodeMap, msgIdsMap, appNode) {
		let core = self.core,
		logger = self.logger,
		appStr = '',
		appName = core.getAttribute(appNode, 'name'),
		appWCET = core.getAttribute(appNode, 'WCET'),
		appPriority = core.getAttribute(appNode, 'priority');

		appStr += '{name="' + appName + '", ';
		appStr += 'WCET=' + appWCET + ', ';
		appStr += 'priority=' + appPriority + ', ';
		appStr += 'wakeup_cnt=0, exe_time=0, handlers=[';

		let appMsgHandlers = getContainedMetaType(appNode, self, self.META.MsgHandler);
		for (let i = 0; i < appMsgHandlers.length; i++) {
			let handlerNode = appMsgHandlers[i],
			handlerWCET = core.getAttribute(handlerNode, 'WCET'),
			triggerMsgs = getContainedMetaType(handlerNode, self, self.META.TriggerMsg),
			outputMsgGroups = getContainedMetaType(handlerNode, self, self.META.OutputMsgs);

			/* Currently assume (and META requires) only one trigger message. May change later */
			let triggerName = '',
			triggerId = 0;
			if (triggerMsgs.length > 1) {
				logger.error("Message Handler node (path: " + core.getPath(handlerNode) + ') contains multiple trigger messages');
			} else if (triggerMsgs.length < 1) {
				logger.error("Message Handler node (path: " + core.getPath(handlerNode) + ') does not have a trigger message');
			} else {
				let triggerMsg = getContainedMetaType(triggerMsgs[0], self, self.META.MessageTypes);
				if (triggerMsg.length > 0) {
					triggerName = core.getAttribute(triggerMsg[0], 'name');
					triggerId = core.getAttribute(triggerMsg[0], 'msg_id');
					/* Better error handling would be good */
					if (triggerName === '') {
						logger.error("Trigger msg name not initialized or no trigger msg exists");
					} else if (triggerId === 0) {
						logger.error("Trigger msg ID not assigned");
					}
				}
			}

			/* Find and add output message info for each output message group */
			for (let j = 0; j < outputMsgGroups.length; j++) {
				let outputMsgGroup = outputMsgGroups[j];

				/* Add trigger msg info to appStr */
				appStr += '{msg_name="' + triggerName + '", ';
				appStr += 'msg_id=' + triggerId + ', ';
				appStr += 'WCET=' + handlerWCET + ', ';
				appStr += 'responses=[';

				/* Add each message within outputMsgGroup to string */
				let outputMsgs = getContainedMetaType(outputMsgGroup, self, self.META.MessageTypes);
				appStr += getMsgListStr(outputMsgs, appName, self);
				appStr += ']},\n';
			}
		}
		/* Formatting of handlers */
		if (appStr.endsWith(',\n')) {
			appStr = appStr.slice(0, -2);
		}
		appStr += '],\n';

		/* Get periodic actions */
		let appPeriodicActions = getContainedMetaType(appNode, self, self.META.PeriodicAction);
		appStr += "periodic=[";
		for (let i = 0; i < appPeriodicActions.length; i++) {
			let action = appPeriodicActions[i],
			period = core.getAttribute(action, 'period'),
			offset = core.getAttribute(action, 'offset'),
			WCET = core.getAttribute(action, 'WCET');

			appStr += '{period=' + period + ', ';
			appStr += 'offset=' + offset + ', ';
			appStr += 'WCET=' + WCET + ', ';
			appStr += 'msgs=[';

			/* Each periodic action can contain multiple messages */
			let msgs = getContainedMetaType(action, self, self.META.MessageTypes);
			appStr += getMsgListStr(msgs, appName, self);
			appStr += ']},\n';
		}
		/* Format periodic messages */
		if (appStr.endsWith(',\n')) {
			appStr = appStr.slice(0, -2);
		}
		appStr += ']}';

		return appStr;
	}

	function getSchedulerTableStr(self, nodeMap, msgIdsMap, schNode) {
		let core = self.core,
		logger = self.logger,
		tableStr = '[',
		schTableNodes = getContainedMetaType(schNode, self, self.META.SCHTable);

		/* Verify only one scheduler table exists */
		if (schTableNodes.length > 1) {
			logger.error("Scheduler app (path: " + core.getPath(schNode) + ") contains multiple sceduler tables.");
			return '';
		} else if (schTableNodes.length < 1) {
			logger.error("Scheduler app (path: " + core.getPath(schNode) + ") does not contain a sceduler table.");
			return '';
		}
		let schTableNode = schTableNodes[0],
		msgs = getContainedMetaType(schTableNode, self, self.META.PeriodicMsg);

		/* Loop over all messages in sch table */
		for (let i = 0; i < msgs.length; i++) {
			let msg = msgs[i],
			name = core.getAttribute(msg, 'name'),
			period = core.getAttribute(msg, 'period');

			tableStr += '{name="' + name + '", ';
			tableStr += 'period=' + period + ', ';
			tableStr += 'wakeup_count=0},\n';
		}
		/* Formatting */
		if (tableStr.endsWith(',\n')) {
			tableStr = tableStr.slice(0, -2);
		}
		tableStr += ']';

		return tableStr;
	}

	function getEnviornmentStr(self, nodeMap, msgIdsMap, envNode) {
		let core = self.core,
		logger = self.logger,
		envStr = '[',
		events = getContainedMetaType(envNode, self, self.META.Event);

		for (let i = 0; i < events.length; i++) {
			let event = events[i],
			eventTime = core.getAttribute(event, 'triggerTime'),
			dataEntries = getContainedMetaType(event, self, self.META.DataEntry);

			envStr += '{in_queue=[';
			for (let j = 0; j < dataEntries.length; j++) {
				let entry = dataEntries[j],
				entryName = core.getAttribute(entry, 'name'),
				entryID = core.getAttribute(entry, 'id'),
				entryValue = core.getAttribute(entry, 'value'),
				entryOutcome = core.getAttribute(entry, 'outcome'),
				entryType = core.getAttribute(entry, 'entry_type');

				envStr += '{name="' + entryName + '", ';
				envStr += 'id="' + entryID + '", ';
				envStr += 'value="' + entryValue + '", ';
				envStr += 'outcome="' + entryOutcome + '", ';
				envStr += 'entry_type="' + entryType + '"}, ';
			}
			/* Formatting of data entries */
			if (envStr.endsWith(', ')) {
				envStr = envStr.slice(0, -2);
			}
			envStr += '], trigger_time=' + eventTime + '},\n';
		}
		/* Formatting of events */
		if (envStr.endsWith(',\n')) {
			envStr = envStr.slice(0, -2);
		}
		envStr += ']';

		return envStr;
	}

	function getPlexilStr(self, nodeMap, msgIdsMap, plexilNode) {
		let core = self.core,
		logger = self.logger,
		plexilStr = '[';

		/* Get names of PLEXIL plans */
		let plexilPlans = getContainedMetaType(plexilNode, self, self.META.PLEXILPlan);
		for (let i = 0; i < plexilPlans.length; i++) {
			let plan = plexilPlans[i],
			name = core.getAttribute(plan, 'name'),
			rootNode = core.getAttribute(plan, 'rootNode');

			/* As backwards as this may seem, it is not. */
			/* "name" in CPN model is name of root Node, not plan name */
			plexilStr += '{name="' + rootNode + '", ';
			plexilStr += 'nodes=' + name + '},\n';
		}
		/* Formatting of plans string */
		if (plexilStr.endsWith(',\n')) {
			plexilStr = plexilStr.slice(0, -2);
		}
		plexilStr += ']\n\n';

		/* Initial message to load PLEXIL plan */
		/* Currently assume first plan in array is primary plan. This is not a safe assumption */
		if (plexilPlans.length > 0) {
			let primaryPlanName = core.getAttribute(plexilPlans[0], 'name');
			plexilStr += '[{sender="", msg_id=0, destination="PLEXIL", msg_type="DATA", sys_time=0, entries=[';
			plexilStr += '{name="' + primaryPlanName + '", id="", value="", outcome="", entry_type="LOADPLAN"}]}]';
		}

		return plexilStr;
	}

	function getMsgListStr(msgs, sender, self) {
		let core = self.core,
		msgsStr = '';

		for (let i = 0; i < msgs.length; i++) {
			let id = core.getAttribute(msgs[i], 'msg_id');
			msgsStr += '{sender="' + sender + '", ';
			msgsStr += 'destination="", msg_id=' + id + ', ';
			msgsStr += 'sys_time=0, msg_type="DATA", entries=[';

			/* Each message may contain multiple data entries */
			let dataEntries = getContainedMetaType(msgs[i], self, self.META.DataEntry);
			for (let j = 0; j < dataEntries.length; j++) {
				let entry = dataEntries[j],
				entryName = core.getAttribute(entry, 'name'),
				entryID = core.getAttribute(entry, 'id'),
				entryValue = core.getAttribute(entry, 'value'),
				entryOutcome = core.getAttribute(entry, 'outcome'),
				entryType = core.getAttribute(entry, 'entry_type');

				msgsStr += '{name="' + entryName + '", ';
				msgsStr += 'id="' + entryID + '", ';
				msgsStr += 'value="' + entryValue + '", ';
				msgsStr += 'outcome="' + entryOutcome + '", ';
				msgsStr += 'entry_type="' + entryType + '"}, ';
			}
			/* Formatting of data entries */
			if (msgsStr.endsWith(', ')) {
				msgsStr = msgsStr.slice(0, -2);
			}
			msgsStr += ']},\n';
		}
		/* Formatting of output messages */
		if (msgsStr.endsWith(',\n')) {
			msgsStr = msgsStr.slice(0, -2);
		}

		return msgsStr;
	}

	function genSubscriberTable(self, nodeMap, busNode) {
		var core = self.core,
		logger = self.logger,
		cfsNode = core.getParent(busNode),
		pipeNodes = [];

		/* Load node map and find all connected pipes */
		/* Find all pipes within CFS system */
		let childIds = core.getChildrenPaths(cfsNode);
		for (let i = 0; i < childIds.length; i++) {
			let child = nodeMap[childIds[i]],
			nodes = [];
			nodes = getContainedMetaType(child, self, self.META.MSGPipe);
			pipeNodes = pipeNodes.concat(nodes);
		}

		/* Get all message nodes within pipes */
		let msgNodes = [];
		for (let i = 0; i < pipeNodes.length; i++) {
			msgNodes = msgNodes.concat(getContainedMetaType(pipeNodes[i], self, self.META.MessageTypes));
		}

		/* Find corresponding msg_id (default 0) for each message type */
		let msgIds = {};
		for (let i = 0; i < msgNodes.length; i++) {
			let msgName = core.getAttribute(msgNodes[i], "name"),
			msgId = core.getAttribute(msgNodes[i], "msg_id");
			/* Default Value. msg_id not set */
			if (msgId === 0) {
				// If this msgName has not yet been seen
				if (!msgIds[msgName]) {
					msgIds[msgName] = 0;
				}
			}
			/* Specific msg_id has been set in model */
			else {
				msgIds[msgName] = msgId;
			}
		}

		/* Check for duplicate IDs */
		let usedIds = [];
		for (const name in msgIds) {
			let id = msgIds[name];
			/* If id is not found in usedIds, add it */
			if (usedIds.find(function (x) {
					return x === id;
				}) == undefined) {
				usedIds.push(id);
			}
			/* ID already taken. Reset to 0 */
			else {
				msgIds[name] = 0;
			}
		}

		/* Assign unique ID's to all unassigned message types */
		let nextId = 1,
		nextIdIdx = 0;
		usedIds.sort(function (a, b) {
			return a - b
		});
		for (const msgName in msgIds) {
			/* If message already has an id, continue */
			if (msgIds[msgName] > 0) {
				continue;
			}

			/* Check if nextId exists in sorted usedIds array. If so, increment until it does not. */
			while (nextId == usedIds[nextIdIdx]) {
				nextId++;
				nextIdIdx++;
			}

			/* Assign message ID and increment ID */
			msgIds[msgName] = nextId;
			nextId++;
		}

		/* Set all message nodes' msg_id attribute to assigned ID number */
		for (const node in nodeMap) {
			if ((self.isMetaTypeOf(nodeMap[node], self.META.MessageTypes)) && !(core.isMetaNode(nodeMap[node]))) {
				let msgName = core.getAttribute(nodeMap[node], "name"),
				msgId = msgIds[msgName];

				if (msgId === undefined) {
					let path = core.getPath(nodeMap[node]);
					logger.error("Message " + msgName + " (path: " + path + ") msgID undefined. Most likely not connected to any software bus");
					continue;
				}
				core.setAttribute(nodeMap[node], 'msg_id', msgId);
			}
		}

		/* Find and delete any existing subscription table(s) in software bus node */
		let oldSubTables = getContainedMetaType(busNode, self, self.META.SubscriptionTable);
		for (let i = 0; i < oldSubTables.length; i++) {
			core.deleteNode(oldSubTables[i]);
		}

		/* Create new subscriber table in software bus node */
		let subTableNode = core.createNode({
				parent: busNode,
				base: self.META.SubscriptionTable
			}),
		subPipeNodes = pipeNodes.filter(function (node) {
				return self.isMetaTypeOf(node, self.META.SUBPipe);
			});
		for (let i = 0; i < subPipeNodes.length; i++) {
			/* Create subscriber entry in Sub table */
			let subMsgNodes = getContainedMetaType(subPipeNodes[i], self, self.META.MessageTypes),
			appNode = core.getParent(subPipeNodes[i]),
			appName = core.getAttribute(appNode, 'name'),
			pipeName = core.getAttribute(subPipeNodes[i], 'name'),
			subscriberNode = core.createNode({
					parent: subTableNode,
					base: self.META.Subscriber
				});
			core.setAttribute(subscriberNode, 'name', appName);
			core.setAttribute(subscriberNode, 'pipeName', pipeName);

			/* Create message entries within subscriber entry */
			for (let j = 0; j < subMsgNodes.length; j++) {
				let msgName = core.getAttribute(subMsgNodes[j], 'name'),
				msgId = core.getAttribute(subMsgNodes[j], 'msg_id'),
				subbedMsgNode = core.createNode({
						parent: subscriberNode,
						base: self.META.Message
					});

				core.setAttribute(subbedMsgNode, 'name', msgName);
				core.setAttribute(subbedMsgNode, 'msg_id', msgId);
			}
		}

		/* Return msgIds map */
		return msgIds;
	}

	return CPNMarkingGenerator;
});
