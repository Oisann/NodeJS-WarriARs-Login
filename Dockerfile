FROM node:boron

#Create and use the correct work folder
WORKDIR /usr/src/app
#Use the package.json file
COPY package.json .
#Install all packages
RUN npm install

#Copy the project source
COPY . .

EXPOSE 80
CMD [ "npm", "start" ]