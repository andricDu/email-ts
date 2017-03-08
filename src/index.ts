import axios from 'axios';
import * as _ from 'lodash';
import * as nodemailer from 'nodemailer';

interface BillableProject {

  project_name: string;
  project_id: string;
  user_id: string; // this is the billing user
  extra: any;

}

class BillingApi {

  private token: string;

  public async login() : Promise<string> {
    let json = {
      username: 'admin',
      password: 'test'
    };
    
    return axios.post('http://localhost:5000/login', json)
      .then( response => {
        this.token = response.headers.authorization;
        return this.token;
      });
  }

  public async projects() : Promise<Array<BillableProject>> {
    let headers = {
      authorization: `Bearer ${this.token}`
    };

    return axios.get('http://localhost:5000/billingprojects', {headers: headers})
      .then( response => {
        let projects: Array<BillableProject> = response.data;
        return projects;
      });
  }

  public async monthlyReport(projectId: string) : Promise<any> {
    let headers = {
      authorization: `Bearer ${this.token}`
    };

    var date = new Date(), y = date.getFullYear(), m = date.getMonth();
    var firstDay = new Date(y, m, 1);
    var lastDay = new Date(y, m + 1, 0);

    return axios.get(
      `http://localhost:5000/reports?bucket=monthly&fromDate=${firstDay}&toDate=${lastDay}&projects=${projectId}`,
      {headers: headers})
      .then( response => {
        if (response.data['entries'].length > 0) {
          console.log(response.data['entries']);
          var report = this.aggregateEntries(response.data['entries'], 'fromDate');
          return report;
        } else {
          return [];
        }
      });
  }

  private aggregateEntries(entries, groupByIteratee) {
    return _(entries)
      .groupBy(groupByIteratee)
      .map((items, key) => items.reduce((acc, entry) => ({
        ...acc,
        ...entry,
        cpu: (acc.cpu || 0) + (entry.cpu || 0),
        volume: (acc.volume || 0) + (entry.volume || 0),
        image: (acc.image || 0) + (entry.image || 0),
        cpuCost: (acc.cpuCost || 0) + (entry.cpuCost || 0),
        volumeCost: (acc.volumeCost || 0) + (entry.volumeCost || 0),
        imageCost: (acc.imageCost || 0) + (entry.imageCost || 0),
        key,
      })))
      .value();
  }

}

/**
 * Mail Stuffs
 */
let smtpConfig = {
    host: '',
    port: '25',
    secure: false
};
let transport = nodemailer.createTransport(smtpConfig);

/**
 * Run this stuff here
 */
let billing = new BillingApi();
let projects = billing.login().then(token => {
  return billing.projects();
});
projects.then( p => p.map(project => billing.monthlyReport(project.project_id).then(
  report => {
    let message = {
      from: '',
      to: project.extra.email,
      subject: 'Usage Invoice',
      text: JSON.stringify(report)
    };
    transport.sendMail(message, function(err) {
      if(err) {
        console.log(err);
      }  
    });
  }
)));

