/*
*   NOTE: This sample uses ES6 features
*/
import appConfig from './config.js'

const $ = window.$;
const jQuery = window.jQuery;

/**
 * WizardApp class that handles everything in the App.
 * @todo Make app persistent by using localStorage
 */
class WizardApp {
    constructor(){
        // Reference to the PureCloud App (Client App SDK)
        this.pcApp = null;

        // PureCloud Javascript SDK clients
        this.platformClient = require('platformClient');
        this.purecloudClient = this.platformClient.ApiClient.instance;
        this.purecloudClient.setPersistSettings(true, 'premium_app');
        this.redirectUri = appConfig.redirectUri;

        // Permissions required for using the app 
        this.setupPermissionsRequired = appConfig.setupPermissionsRequired;

        // Default permission to add to new roles
        this.premiumAppPermission = appConfig.premiumAppPermission;

        // Language default is english
        // Language context is object containing the translations
        this.language = 'en-us';
        this.languageContext = null

        this.prefix = "PREMIUM_SAMPLE_";
        this.installationData = {
            "roles": [
                {
                    "name": "Role",
                    "description": "Generated role for access to the app.",
                    "permissions": ["admin", "premium_app_permission"]
                }
            ],
            "groups": [
                {
                    "name": "Agents",
                    "description": "Agents have access to a widget that gives US state information based on caller's number.",
                },
                {
                    "name": "Supervisors",
                    "description": "Supervisors have the ability to watch a queue for ACD conversations.",
                }
            ],
            "appInstances": [
                {
                    "name": "Agent Widget",
                    "url": "https://mypurecloud.github.io/purecloud-premium-app/index.html?lang={{pcLangTag}}&environment={{pcEnvironment}}",
                    "type": "widget",
                    "groups": ["Agents", "Supervisors"]
                },
                {
                    "name": "Supervisor Widget",
                    "url": "https://mypurecloud.github.io/purecloud-premium-app/supervisor.html?lang={{pcLangTag}}&environment={{pcEnvironment}}",
                    "type": "standalone",
                    "groups": ["Supervisors"]
                }
            ]
        }

        // Used to determine progress
        //this.totalSteps = 11;
        this.currentStep = 0;
    }

    /**
     * First thing that needs to be called to setup up the PureCloud Client App
     * @param {String} forceLang fallback language if translation file does not exist 
     * @returns {Promise} Due to AJAX call of language file
     */
    _setupClientApp(forceLang){    
        this.language = forceLang;

        // Snippet from URLInterpolation example: 
        // https://github.com/MyPureCloud/client-app-sdk
        const queryString = window.location.search.substring(1);
        const pairs = queryString.split('&');
        let pcEnv = null;   
        for (var i = 0; i < pairs.length; i++)
        {
            var currParam = pairs[i].split('=');

            if(currParam[0] === 'langTag') {
                if(!forceLang) this.language = currParam[1];
            } else if(currParam[0] === 'pcEnvironment') {
                pcEnv = currParam[1];
            } else if(currParam[0] === 'environment' && pcEnv === null) {
                pcEnv = currParam[1];
            }
        }

        if(pcEnv){
            this.pcApp = new window.purecloud.apps.ClientApp({pcEnvironment: pcEnv});
        }else{
            // Use default PureCloud region
            this.pcApp = new window.purecloud.apps.ClientApp();
        }
        
        console.log(this.pcApp.pcEnvironment);

        // Get the language context file and assign it to the app
        return new Promise((resolve, reject) => {
            resolve();
            // let fileUri = './languages/' + this.language + '.json';
            // $.getJSON(fileUri)
            // .done(data => {
            //     this.languageContext = data;
            //     resolve()
            // })
            // .fail(xhr => {
            //     console.log('Language file not found. Defaulting to en-us');
            //     this._setupClientApp('en-us');
            // }); 
        });
    }

    /**
     * Authenticate to PureCloud (Implicit Grant)
     * @todo Assign default or notify user if can't determine purecloud environment
     */
    _pureCloudAuthenticate() {
        return new Promise((resolve, reject) => {
            // Authenticate through PureCloud
            this.purecloudClient.loginImplicitGrant(appConfig.clientIDs[this.pcApp.pcEnvironment], 
                                    this.redirectUri, 
                                    {state: ('pcEnvironment=' + this.pcApp.pcEnvironment)})
            
            // Check user permissions
            .then(data => {
                console.log(data);
                resolve();
            // Error handler catch all
            }).catch(err => console.log(err));
        });
    }

    getUserDetails(){
        let usersApi = new this.platformClient.UsersApi();
        let opts = {'expand': ['authorization']};
    
        return usersApi.getUsersMe(opts)
    }

    validateProductAvailability(){
        // premium-app-example
        return new Promise((resolve, reject) => {
            let integrationsApi = new this.platformClient.IntegrationsApi();
            
            integrationsApi.getIntegrationsTypes({})
            .then((data) => {
                if (data.entities.filter((integType) => integType.id === "premium-app-example")[0]){
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
        });
    }

    /**
     * Gets the org info
     */
    getOrgInfo(){
        let organizationApi = new this.platformClient.OrganizationApi();

        // Get organization information
        return organizationApi.getOrganizationsMe()
    }


    isExisting(){
        return new Promise((resolve, reject) => {
            this.getExistingGroups()
            .then((data) => {
                if(data.total > 0) resolve();
                else 
                return this.getExistingRoles()
            })
            .then((data) => {
                if(data.total > 0) resolve();
                else 
                return this.getExistingApps()
            })
            .then((data) => {
                
            })
        })
    }

    /**
     * Gets the existing groups on PureCloud based on Prefix
     */
    getExistingGroups(){
        // PureCloud API instances
        const groupsApi = new this.platformClient.GroupsApi();

        // Query bodies
        var groupSearchBody = {
            "query": [
                {
                    "fields": ["name"],
                    "value": this.prefix,
                    "operator": "OR",
                    "type": "STARTS_WITH"
                }
            ]
        };

        return groupsApi.postGroupsSearch(groupSearchBody);
    }

    /**
     * Delete Group from PureCloud org
     * @param {String} groupId 
     */
    deletePureCloudGroup(groupId){
        let groupsApi = new this.platformClient.GroupsApi();

        return groupsApi.deleteGroup(groupId);
    }

    /**
     * Get existing roles in purecloud based on prefix
     * @todo Get role based on permission. NOTE: if permission is on permissionPolicy instead of General,
     *       PureCloud don't have API to easily search using it.
     */
    getExistingRoles(){
        const authApi = new this.platformClient.AuthorizationApi();

        let authOpts = { 
            'name': this.prefix + "*", // Wildcard to work like STARTS_WITH 
            'userCount': false
        };

        return authApi.getAuthorizationRoles(authOpts);
    }

    /**
     * Delete the specified role
     * @param {String} roleId 
     */
    deletePureCloudRole(roleId){
        let authApi = new this.platformClient.AuthorizationApi();

        return authApi.deleteAuthorizationRole(roleId)
    }

    /**
     * Get existing apps based on the prefix
     * @todo Get instances of a particular type of app.
     */
    getExistingApps(){
        const integrationApi = new this.platformClient.IntegrationsApi();
        let integrationsOpts = {
            'pageSize': 100
        }
        return integrationApi.getIntegrations(integrationsOpts);
    }

    /**
     * Delete a PureCLoud instance
     * @param {String} instanceId 
     */
    deletePureCloudApp(instanceId){
        let integrationsApi = new this.platformClient.IntegrationsApi();

        return integrationsApi.deleteIntegration(instanceId)
    }


    /**
     * Final Step of the installation wizard. Actually install every staged object.
     */
    installConfigurations(){
        // Api instances
        let groupsApi = new this.platformClient.GroupsApi();
        let authApi = new this.platformClient.AuthorizationApi();
        let integrationsApi = new this.platformClient.IntegrationsApi();

        // Keep the promises of the creation calls
        // This will be used to keep track once a particular batch resolves
        let groupPromises = [];
        let authPromises = [];
        let integrationPromises = [];

        // Once groups are created store the names and the ids
        // object of (groupName: groupId) pairs
        let groupData = {};

        // Get info from created integrations
        let integrationsData = [];

        return new Promise((resolve,reject) => { 
            // Create the roles
            this.installationData.roles.forEach((role) => {
                // Add the premium app permission if not included in staging area
                if(!role.permissions.includes(appConfig.premiumAppPermission))
                    role.permissions.push(appConfig.premiumAppPermission);

                let roleBody = {
                        "name": this.prefix + role.name,
                        "description": "",
                        "permissions": role.permissions
                };

                // TODO: Fix roles assingment not working
                let roleId = null;
                authPromises.push(
                    authApi.postAuthorizationRoles(roleBody)
                    .then((data) => {
                        this.logInfo("Created role: " + role.name, this.currentStep++);
                        roleId = data.id;

                        return self.getUserDetails();
                    })
                    .then((data) => {
                        return authApi.putAuthorizationRoleUsersAdd(roleId, [data.userId]);
                    })
                    .then((data) => {
                        this.logInfo("Assigned " + role.name + " to user", this.currentStep++);
                    })
                    .catch((err) => console.log(err))
                );
            });

            // Create the groups
            Promise.all(authPromises)
            .then(() => {
                this.installationData.groups.forEach((group) => {
                    let groupBody = {
                        "name": this.prefix + group.name,
                        "description": group.description,
                        "type": "official",
                        "rulesVisible": true,
                        "visibility": "members"
                        }

                    groupPromises.push(
                        groupsApi.postGroups(groupBody)
                        .then((data) => {
                            this.logInfo("Created group: " + group.name, this.currentStep++);
                            groupData[group.name] = data.id;
                        })
                        .catch((err) => console.log(err))
                    );
                });

                // After groups are created, create instances
                // There are two steps for creating the app instances
                // 1. Create instance of a custom-client-app
                // 2. Configure the app
                // 3. Activate the instances
                Promise.all(groupPromises)
                .then(() => {
                    this.installationData.appInstances.forEach((instance) => {
                        let integrationBody = {
                            "body": {
                                "integrationType": {
                                    "id": "embedded-client-app"
                                }
                            }
                        }

                        integrationPromises.push(
                            integrationsApi.postIntegrations(integrationBody)
                            .then((data) => {
                                this.logInfo("Created instance: " + instance.name, this.currentStep++);
                                let integrationConfig = {
                                    "body": {
                                        "name": this.prefix + instance.name,
                                        "version": 1, 
                                        "properties": {
                                            "url" : instance.url,
                                            "sandbox" : "allow-forms,allow-modals,allow-popups,allow-presentation,allow-same-origin,allow-scripts",
                                            "displayType": instance.type,
                                            "featureCategory": "", 
                                            "groups": instance.groups.map((groupName) => groupData[groupName])
                                        },
                                        "advanced": {},
                                        "notes": "",
                                        "credentials": {}
                                    }
                                }

                                integrationsData.push(data);
                                return integrationsApi.putIntegrationConfigCurrent(data.id, integrationConfig)
                            })
                            .then((data) => {
                                this.logInfo("Configured instance: " + data.name, this.currentStep++);                           
                            })
                            .catch((err) => console.log(err))
                        );
                    });
                    return Promise.all(integrationPromises);
                })
                .then(() => {
                    let enablePromises = [];
                    integrationsData.forEach((instance) => {
                        let opts = {
                            "body": {
                                "intendedState": "ENABLED"
                            }
                         }

                        enablePromises.push(
                            integrationsApi.patchIntegration(instance.id, opts)
                            .then((data) => this.logInfo("Enabled instance: " + data.name, this.currentStep++))
                            .catch((err) => console.log(err))
                        );
                    });
                    
                    return Promise.all(enablePromises);
                })
                .then(() => {
                    this.logInfo("Installation Complete!", this.currentStep++);
                    resolve();
                })
            });
        });
    }

    logInfo(data, progress){
        if (!data || (typeof(data) !== 'string')) data = "";
        if (!progress) progress = 0;

        $.LoadingOverlay("text", data);
        $.LoadingOverlay("progress", progress * 11)
    }

    /**
     * @description First thing that must be called to set-up the App
     */
    start(){
        return new Promise((resolve, reject) => {
            this._setupClientApp()
            .then(() => this._pureCloudAuthenticate())
            .then(() => resolve())
            .catch(() => reject())
        });
    }
}


export default WizardApp