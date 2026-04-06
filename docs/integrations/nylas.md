Quickstart: Using Nylas Scheduler
In this guide, you’ll build a sample web application that allows you to host the Scheduler Editor and Scheduling Pages. Using the application, you’ll create your first Scheduling Page.

If you want to see the complete code for this Quickstart guide, you can find it on GitHub: Web component (HTML) or React.

A sample web app that demonstrates a Scheduling Page and the Scheduler Editor
Before you begin
For this Quickstart guide, we’ll use the Node environment to create our frontend application, and run it locally. If you prefer to work with a different coding language, you can use any environment or framework that lets you run the front end application locally.

Be sure to have the following ready before you begin:

The Node development environment installed- The minimum required Node version is v18.0.0. To check the Node version, run node -v in your terminal.
Set up your Nylas account
This section is all about what we need to do before we start coding.

Create a Nylas account - Nylas offers a free Sandbox account where you can prototype and test the Nylas APIs. Sign up to create a Nylas account.
Get your application credentials - To use the Nylas API, you need your Nylas application’s client ID, which you can get from the Dashboard. You’ll save these credentials in your code environment as NYLAS_CLIENT_ID. You can find your Nylas client ID on the Dashboard Overview page:
Bootstrap your app
This section walks you through setting up a basic local project to serve a front-end application. Nothing here is Nylas-specific - we’re just getting the server scaffold ready.

Create a new local project
First, create a new local project for testing in a new directory called /nylas-scheduler. There are two ways to add a custom Scheduler: using Web components (HTML) or React. Pick one of these paths as you complete the rest of the Quickstart guide. Start by copying and pasting the commands below directly into your terminal or command line tool.

HTML
React
mkdir nylas-scheduler/
cd nylas-scheduler/
touch index.html
touch scheduler-editor.html

Set up user auth using Nylas
This explains how to configure Nylas’ Hosted authentication to authenticate users in your app.

Register callback URI
Next, register a callback URI with Nylas. This is where Nylas redirects the user when they complete authentication.

For this walkthrough, the URI includes localhost because we’re using a local development environment. The default port is 3000.

You might need to use a different port number. You should use the conventional port that your chosen language and framework uses.

In your Sandbox application, click Hosted Authentication in the left navigation, and click Callback URIs.
Click Add a callback URI, and enter your application’s callback URI.
Select the JavaScript platform.
For URL, enter http://localhost:<PORT>/scheduler-editor.
For Origin, enter http://localhost:<PORT>.
Click Add callback URI.
Hosted authentication screen showing the Callback URIs tab, and a freshly added entry for a localhost callback URI.
The URL endpoints can be anything you want. However, they must match the callback URI and port in your application when you configure the Scheduler Editor Component.

Set up the Scheduler Editor and Scheduling Components
The complete code for this Quickstart guide is available on GitHub. You can clone the repo and run the app to see it in action for as a Web component (HTML) or in React.

This section is the fun part! Now that you’ve set up user authentication, you can use the Nylas Scheduler Editor to create a Scheduling Page.

There are lots of options and data properties to play around with. You’ll see a few in the following examples, and you can visit the Scheduler UI components references to learn more.

In this section, you’ll learn how to…

Include the Nylas Scheduler Editor and Scheduling scripts in your app.
Start a local development sever.
Include the Nylas Scheduler Editor and Scheduling scripts in your app
To use the Scheduler UI Components, you need to include the Scheduler Editor and Scheduling scripts in your app. The files that you need to update vary depending on whether you’re building with HTML/Vanilla JS or React.

Type	UI Component	Files
HTML/Vanilla JS	Scheduler Editor	scheduler-editor.html
Scheduling	index.html
React	Scheduler Editor	App.tsx, index.css
Scheduling	App.tsx, App.css
The following examples add the Nylas Scheduler Editor and Scheduling scripts in your app.

Make sure to replace the NYLAS_CLIENT_ID with the value you copied from the Dashboard in the Get your application credentials step.

HTML (scheduler-editor.html)
HTML (index.html)
React (App.tsx)
React (index.css)
React (App.css)
<!-- scheduler-editor.html -->

<!DOCTYPE html>
<html class="h-full bg-white" lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nylas Scheduler Editor Component</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>

    <style type="text/css">
      body {
        font-family: "Inter", sans-serif;
      }
    </style>
  </head>
  <body class="h-full">
    <div class="grid h-full place-items-center">
      <!-- Add the Nylas Scheduler Editor component -->
      <nylas-scheduler-editor />
    </div>

    <!-- Configure the Nylas Scheduler Editor component -->
    <script type="module">
      import { defineCustomElement } from "https://cdn.jsdelivr.net/npm/@nylas/web-elements@latest/dist/cdn/nylas-scheduler-editor/nylas-scheduler-editor.es.js";

      defineCustomElement();

      const schedulerEditor = document.querySelector("nylas-scheduler-editor");
      schedulerEditor.schedulerPreviewLink = `${window.location.origin}/?config_id={config.id}`;
      schedulerEditor.nylasSessionsConfig = {
        clientId: "<NYLAS_CLIENT_ID>", // Replace with your Nylas client ID from the previous section.
        redirectUri: `${window.location.origin}/scheduler-editor`,
        domain: "https://api.us.nylas.com/v3",
        hosted: true,
        accessType: "offline",
      };

      schedulerEditor.defaultSchedulerConfigState = {
        selectedConfiguration: {
          // Create a public Configuration that doesn't require a session.
          requires_session_auth: false,
          scheduler: {
            rescheduling_url: `${window.location.origin}/reschedule/:booking_ref`,
            cancellation_url: `${window.location.origin}/cancel/:booking_ref`
          }
        }
      };
    </script>
  </body>
</html>

Start a local development server
To create a Scheduling Page from the Scheduler Editor, you’ll need a working Scheduler UI. To do this, run a local server to host your Scheduler Editor and Scheduling Pages.

Navigate the root directory of your project and run the following command.

HTML
React
npx serve --listen <PORT>

After you run the command, open your browser to http://localhost:<PORT>/scheduler-editor to see your Scheduler Editor.

Create a Scheduling Page
When you visit the Scheduler Editor, you are prompted to log in to the editor using the provider of your choice. Select the provider to use and log in to your account. After you log in, the provider redirects you to the Scheduler Editor.

A screenshot of the Scheduler Editor login page
You can now create a new Scheduling Page. Click Create new.

A screenshot of the Scheduler Editor listing Scheduling Pages
Enter the event title, duration, and description. To set the availability for the event, click Availability in the left navigation. After you enter the event details, click Create.

A screenshot of the Scheduler Editor creating the Scheduling Page
If you click Cancel, the Scheduler Editor shows the manager view, which includes a list of available Scheduling Pages.

A screenshot of the Scheduler Editor Preview
Visit your Scheduling Page
To visit the Scheduling Page you just created, click Preview from the Scheduler Editor manager view. The Scheduling Page’s URL includes the configuration ID. Once you have the configuration ID, you can also visit the Scheduling Page at http://localhost:3000/?config_id=<NYLAS_SCHEDULER_CONFIGURATION_ID>.

The Scheduling Page allows you to book an event using the configuration you set the previous steps.


Nylas Scheduler APIs

Download OpenAPI Document

Download OpenAPI Document
This API reference documentation covers the Nylas Scheduler API. See the see the Administration API documentation for information about working with Nylas applications, authentication, connectors, and webhook subscriptions.
The Nylas Scheduler API is designed using the REST ideology to provide simple and predictable URIs to access and modify objects. Requests support standard HTTP methods like GET, PUT, POST, and DELETE, and standard status codes. Response bodies are always UTF-8 encoded JSON objects, unless explicitly documented otherwise.

Scheduler documentation
You can find more information about Scheduler in the main documentation set:

Scheduler overview
Scheduler Quickstart guide
Nylas encoding
Response bodies are always UTF-8 encoded JSON objects, unless explicitly documented otherwise.

Nylas Postman collection
You can use the Nylas Postman collection to quickly start using the Nylas Scheduler API. For more information, check out the Nylas Postman collection documentation.

Updating objects
PUT and PATCH requests behave similarly in Nylas: when you make a request, Nylas replaces all data in the nested object with the information you define. Because of this, your request might fail if you don't include all mandatory fields.

Nylas doesn't erase the data from fields that you don't include in your request, so you can define only the mandatory fields and any that you want to update.

Scheduler UI Components
The Scheduler UI components are a set of web- and React-based components that you can use to build a custom scheduling experience in your project.

Enable compression to optimize performance
The Nylas APIs support application/gzip (compressed) format as well as the standard plaintext application/json. Using gzip compression greatly improves API performance, especially when you use it with query parameters to limit the objects returned and field selection to limit which fields you're querying for.

If you enable this, make sure your project watches the response headers so it can expand compressed responses when needed. You can read more about this in the Curl.dev documentation.

